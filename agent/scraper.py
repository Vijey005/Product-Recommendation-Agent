"""
agent/scraper.py
────────────────
Flipkart product data scraper — subprocess-based, production-ready.

Exposes a single public function:
    scrape_products_sequential(products: list[dict]) -> list[dict]

Each product dict is enriched in-place with any combination of:
    {
        "imageUrl":    str | None,   # high-res Flipkart CDN URL (1080×1080)
        "rating":      float | None, # e.g. 4.3
        "reviewCount": int | None,   # e.g. 16659
        "price":       int | None,   # INR integer, e.g. 54999
        "currency":    str | None,   # "INR" when price is set
    }

Design notes:
  • Playwright's sync_playwright CANNOT run inside an asyncio event loop
    (FastAPI/uvicorn owns the loop). Running it in asyncio.to_thread() is
    insufficient — Playwright internally calls asyncio.run() which raises
    NotImplementedError when a loop is already running.

  • Solution: spawn a completely isolated child Python process that has its
    own event loop and can safely use sync_playwright. The worker script is
    embedded as a string, written to stdin, and executed via subprocess.run().
    The parent sends product names as JSON on stdin; the child returns results
    as JSON on stdout.

  • A single Chromium browser is reused across ALL products in the worker
    process (one boot cost), then the worker exits cleanly.

  • Timeouts are aggressive (5 s selector, 12 s navigation) so a non-matching
    product never stalls the pipeline for more than ~15 seconds.

  • The function NEVER raises — any exception returns empty dict fields so the
    pipeline continues gracefully.
"""

from __future__ import annotations

import json
import logging
import subprocess
import sys
from typing import Any

logger = logging.getLogger(__name__)

# ─── Embedded worker script ───────────────────────────────────────────────────
# This runs in a fresh subprocess with its own event loop.
# It reads a JSON list of product names from stdin and writes a JSON dict
# {product_name: {imageUrl, rating, reviewCount, price}} to stdout.

_WORKER_SCRIPT = r'''
import json
import re
import sys
import urllib.parse


# ─── Helper: extract ₹ price from raw text ────────────────────────────────────
def _parse_inr(text):
    m = re.search(r'[₹\u20b9]\s*([\d,]+)', text)
    if m:
        try:
            return int(m.group(1).replace(",", ""))
        except ValueError:
            pass
    return None


# ─── Flipkart scraper ─────────────────────────────────────────────────────────
def _scrape_flipkart(browser, product_name):
    'Return dict with price, rating, reviewCount, imageUrl from Flipkart.'
    result = {"imageUrl": None, "rating": None, "reviewCount": None, "price": None}
    page = None
    try:
        page = browser.new_page()

        def _route_handler(route):
            if route.request.resource_type in {"stylesheet", "media", "font"}:
                route.abort()
            else:
                route.continue_()

        page.route("**/*", _route_handler)

        query = urllib.parse.quote_plus(product_name)
        page.goto(f"https://www.flipkart.com/search?q={query}",
                  wait_until="domcontentloaded", timeout=14_000)

        try:
            page.wait_for_selector("div[data-id]", timeout=6_000)
        except Exception:
            return result

        cards = page.locator("div[data-id]").all()
        query_words = product_name.lower().split()
        target = None

        for card in cards:
            try:
                text = card.inner_text().lower()
                if all(word in text for word in query_words):
                    target = card
                    break
            except Exception:
                continue

        if target is None and cards:
            target = cards[0]
        if target is None:
            return result

        raw_text = target.inner_text()

        # 1. Price
        result["price"] = _parse_inr(raw_text)

        # 2. Rating — match "4.3 ★" or "4.3\n16,659 Ratings"
        rm = re.search(
            r'(\d\.\d)\s*[★\u2605]|(\d\.\d)(?=\s*[\n\r]*\s*[\d,]+\s*Ratings)',
            raw_text, re.IGNORECASE,
        )
        if rm:
            try:
                result["rating"] = float(rm.group(1) or rm.group(2))
            except ValueError:
                pass

        # 3. Review count
        cm = re.search(r'([\d,]+)\s*Ratings', raw_text, re.IGNORECASE)
        if cm:
            try:
                result["reviewCount"] = int(cm.group(1).replace(",", ""))
            except ValueError:
                pass

        # 4. Image
        try:
            src = target.locator("img").first.get_attribute("src")
            if src and src.startswith("http"):
                src = re.sub(r'/image/\d+/\d+/', '/image/1080/1080/', src)
                result["imageUrl"] = src
        except Exception:
            pass

    except Exception:
        pass
    finally:
        if page is not None:
            try:
                page.close()
            except Exception:
                pass

    return result


# ─── Amazon India price fallback ──────────────────────────────────────────────
def _scrape_amazon_price(browser, product_name):
    'Return INR price int from Amazon.in, or None on failure.'
    page = None
    try:
        page = browser.new_page()

        def _block_heavy(route):
            if route.request.resource_type in {"stylesheet", "media", "font", "image"}:
                route.abort()
            else:
                route.continue_()

        page.route("**/*", _block_heavy)

        query = urllib.parse.quote_plus(product_name)
        page.goto(f"https://www.amazon.in/s?k={query}",
                  wait_until="domcontentloaded", timeout=14_000)

        # Wait for search results
        try:
            page.wait_for_selector("[data-component-type='s-search-result']", timeout=6_000)
        except Exception:
            return None

        results = page.locator("[data-component-type='s-search-result']").all()
        query_words = product_name.lower().split()
        target_result = None

        for r in results:
            try:
                title_el = r.locator("h2 span")
                title_text = title_el.first.inner_text().lower()
                if all(w in title_text for w in query_words):
                    target_result = r
                    break
            except Exception:
                continue

        if target_result is None and results:
            target_result = results[0]

        if target_result is None:
            return None

        # Try the whole-number price span first
        try:
            whole = target_result.locator(".a-price-whole").first.inner_text()
            price = int(whole.replace(",", "").replace(".", "").strip())
            if price > 0:
                return price
        except Exception:
            pass

        # Fallback: regex on full card text
        try:
            card_text = target_result.inner_text()
            return _parse_inr(card_text)
        except Exception:
            pass

    except Exception:
        pass
    finally:
        if page is not None:
            try:
                page.close()
            except Exception:
                pass

    return None


# ─── Main orchestrator ────────────────────────────────────────────────────────
def _scrape_single(browser, product_name):
    'Scrape one product: Flipkart first, then Amazon fallback for price.'
    result = _scrape_flipkart(browser, product_name)

    # If Flipkart returned no price, try Amazon India as fallback
    if result.get("price") is None:
        amazon_price = _scrape_amazon_price(browser, product_name)
        if amazon_price:
            result["price"] = amazon_price
            result["currency_source"] = "amazon"  # debug tag
    else:
        result["currency_source"] = "flipkart"

    return result


def main():
    raw = sys.stdin.read().strip()
    if not raw:
        print(json.dumps({}))
        return

    product_names = json.loads(raw)
    results = {}

    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                for name in product_names:
                    try:
                        results[name] = _scrape_single(browser, name)
                    except Exception:
                        results[name] = {"imageUrl": None, "rating": None, "reviewCount": None, "price": None}
            finally:
                try:
                    browser.close()
                except Exception:
                    pass
    except Exception:
        for name in product_names:
            results[name] = {"imageUrl": None, "rating": None, "reviewCount": None, "price": None}

    print(json.dumps(results))


if __name__ == "__main__":
    main()
'''


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def scrape_products_sequential(products: list[dict]) -> list[dict]:
    """
    Scrape Flipkart for each product in `products` using a subprocess runner.

    Spawns a fresh Python child process that:
      1. Receives all product names as JSON on stdin.
      2. Opens a single Chromium browser via sync_playwright.
      3. Scrapes each product page for price, image, rating, reviewCount.
      4. Returns results as JSON on stdout.

    Results are merged back into the product dicts in-place.
    Only non-None scraped values overwrite existing values.

    Args:
        products: List of product dicts. Each must have a "name" key.

    Returns:
        The same list with enriched fields merged in.
    """
    if not products:
        return products

    product_names = [p.get("name", "").strip() for p in products if p.get("name", "").strip()]
    if not product_names:
        return products

    logger.info("[scraper] Launching subprocess to scrape %d product(s) from Flipkart...", len(product_names))

    scraped_data: dict[str, Any] = {}

    try:
        proc = subprocess.run(
            [sys.executable, "-c", _WORKER_SCRIPT],
            input=json.dumps(product_names),
            capture_output=True,
            text=True,
            timeout=120,  # 2-minute hard limit for all products combined
        )

        stdout = proc.stdout.strip()
        if stdout:
            try:
                scraped_data = json.loads(stdout)
                logger.info("[scraper] ✅ Subprocess returned data for %d product(s).", len(scraped_data))
            except json.JSONDecodeError as e:
                logger.warning("[scraper] Failed to parse subprocess JSON output: %s", e)

        if proc.returncode != 0 and proc.stderr:
            # Log stderr only at debug level — Playwright prints noisy warnings
            logger.debug("[scraper] Subprocess stderr: %s", proc.stderr[:500])

    except subprocess.TimeoutExpired:
        logger.warning("[scraper] Subprocess timed out after 120s — products returned unenriched.")
    except Exception as exc:
        logger.warning("[scraper] Subprocess failed: %s — products returned unenriched.", exc)

    # ── Merge scraped data back into product dicts ────────────────────────────
    for product in products:
        name = product.get("name", "").strip()
        if not name:
            continue
        scraped = scraped_data.get(name, {})
        if not scraped:
            logger.debug("[scraper] No data returned for '%s'.", name)
            continue

        # Price
        if scraped.get("price") is not None:
            product["price"] = scraped["price"]
            product["currency"] = "INR"
            logger.info("[scraper] '%s' → price=₹%s", name, f"{scraped['price']:,}")

        # Image
        if scraped.get("imageUrl"):
            product["imageUrl"] = scraped["imageUrl"]

        # Rating
        if scraped.get("rating") is not None:
            product["rating"] = scraped["rating"]

        # Review count
        if scraped.get("reviewCount") is not None:
            product["reviewCount"] = scraped["reviewCount"]

        logger.info(
            "[scraper] ✅ '%s' → ₹%s | rating=%s | reviews=%s | image=%s",
            name,
            f"{scraped.get('price'):,}" if scraped.get("price") else "N/A",
            scraped.get("rating") or "N/A",
            scraped.get("reviewCount") or "N/A",
            "found" if scraped.get("imageUrl") else "none",
        )

    return products
