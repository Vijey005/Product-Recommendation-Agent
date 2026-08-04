from playwright.sync_api import sync_playwright
import urllib.parse
import requests
import os
import re

def scrape_flipkart_full(product_name):
    with sync_playwright() as p:
        print(f"\n[1/4] Booting headless browser for: '{product_name}'...")
        
        browser = p.chromium.launch(headless=True) 
        page = browser.new_page()
        
        # Block heavy network requests for speed
        page.route("**/*", lambda route: route.abort() if route.request.resource_type in ["image", "stylesheet", "media", "font"] else route.continue_())
        
        query = urllib.parse.quote_plus(product_name)
        url = f"https://www.flipkart.com/search?q={query}"
        
        print("[2/4] Fetching HTML data...")
        page.goto(url, wait_until="domcontentloaded")
        
        try:
            page.wait_for_selector('div[data-id]', timeout=5000)
        except Exception:
            print("Timeout: Could not load the main search results.")
            browser.close()
            return

        results = page.locator('div[data-id]').all()
        target_result = None
        
        print("[3/4] Verifying exact match...")
        query_words = product_name.lower().split()
        
        for result in results:
            card_text = result.inner_text().lower()
            
            is_exact_match = all(word in card_text for word in query_words)
            if is_exact_match:
                target_result = result
                break

        if not target_result:
            print("Product not found. The platform suggested alternatives, but the script skipped them.")
            browser.close()
            return

        print("[4/4] Extracting and downloading high-res data...")
        
        raw_text = target_result.inner_text()
        
        # --- DATA EXTRACTION ---
        
        # 1. Extract Price
        price_match = re.search(r'₹\s*([\d,]+)', raw_text)
        price = f"₹{price_match.group(1)}" if price_match else "Price not found"

        # 2. Extract Star Rating
        rating_match = re.search(r'(\d\.\d)\s*★|(\d\.\d)(?=\s*\n*\s*\d+[,0-9]*\s*Ratings)', raw_text, re.IGNORECASE)
        rating = rating_match.group(1) or rating_match.group(2) if rating_match else "No rating found"

        # 3. Extract Rating Count
        count_match = re.search(r'([\d,]+)\s*Ratings', raw_text, re.IGNORECASE)
        rating_count = count_match.group(1) if count_match else "0"

        # 4. Extract High-Res Image
        try:
            image_url = target_result.locator('img').first.get_attribute('src')
            if image_url:
                image_url = re.sub(r'/image/\d+/\d+/', '/image/1080/1080/', image_url)
        except Exception:
            image_url = None

        # --- FINAL OUTPUT ---
        print("-" * 40)
        print(f"Exact Match Found: {raw_text.splitlines()[0][:50]}...")
        print(f"Price: {price}")
        print(f"Rating: {rating} / 5 (Based on {rating_count} user ratings)")
        
        if image_url and image_url.startswith("http"):
            print(f"High-Res Image Source: {image_url}")
            os.makedirs("scraped_images", exist_ok=True)
            safe_filename = "".join([c if c.isalnum() else "_" for c in product_name])
            filepath = f"scraped_images/{safe_filename}.jpg"
            
            img_data = requests.get(image_url).content
            with open(filepath, "wb") as handler:
                handler.write(img_data)
            print(f"Successfully saved to: {filepath}")
        else:
            print("No valid image found.")
        print("-" * 40)
        
        browser.close()

if __name__ == "__main__":
    user_input = input("Enter a product name to search: ")
    scrape_flipkart_full(user_input)