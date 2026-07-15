"""
agent/nodes.py
──────────────
LangGraph nodes for the Product Recommendation Agent.

Phase 2 node execution paths:
  Interview path (is_profile_complete == False):
    1. analyzer_node          — extract constraints
    2. question_generator_node — ask next best question

  Search & Vault path (is_profile_complete == True, is_rag_mode == False):
    1. analyzer_node          — extract constraints (sets is_profile_complete)
    2. search_and_vault_node  — Tavily search → ChromaDB upsert

  RAG Chat path (is_rag_mode == True — dispatched directly from main.py):
    comparison_agent_node     — similarity search → grounded LLM answer
"""

from __future__ import annotations

import hashlib
import json
import os

# ── Must be set BEFORE any transformers/sentence-transformers import ──────────
# Prevents transformers from attempting to import TensorFlow/Keras modules,
# which causes a ValueError when Keras 3 is installed without tf-keras.
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

import random
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel, Field
from tavily import TavilyClient

from agent.models import ProductConstraints
from agent.state import AgentState

# ─── Tuneable constants ───────────────────────────────────────────────────────
# Minimum filled constraint fields before the agent considers the profile done.
COMPLETION_THRESHOLD = 5

# ChromaDB vault directory (relative to project root — persists across sessions)
VAULT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "chroma_vault")

# Collection name inside ChromaDB
VAULT_COLLECTION = "product_vault"

# Number of Tavily search results to fetch per query
TAVILY_MAX_RESULTS = 5

# Splitter settings for web page content
CHUNK_SIZE    = 1000
CHUNK_OVERLAP = 150

# Number of vault chunks to retrieve for each RAG query
# Set high so the comparison LLM has enough context to fill a full spec table
# across 4-7 phones without hitting 'Not available in data' for common fields.
RAG_TOP_K = 20

# Minimum chunks per product before triggering supplementary search (Layer 4)
MIN_CHUNKS_PER_PRODUCT = 20

# ── Phase 2.6: Devil's Advocate Mode constants ────────────────────────────────
# Custom User-Agent for unauthenticated Reddit JSON requests.
# Reddit blocks requests without a descriptive UA string (returns 429/403).
REDDIT_USER_AGENT = "ProductConciergeBot/1.0 (Language=Python; EphemeralRAG)"

# Max Reddit posts to fetch per product via the public /search.json endpoint.
REDDIT_MAX_POSTS = 7

# Chunk settings for forum comment text — tight to preserve individual comment context.
FORUM_CHUNK_SIZE    = 500
FORUM_CHUNK_OVERLAP = 50

# Number of forum critique chunks to retrieve per advocate query.
ADVOCATE_TOP_K = 25


# ─── Phase 2.75: Forum Analytics Pydantic Schemas ───────────────────────────

class ForumInsight(BaseModel):
    """Represents a single triaged insight extracted from a community forum post."""
    raw_quote: str = Field(
        description=(
            "An authentic raw user quote, comment segment, or highly granular summary point "
            "extracted from the context."
        )
    )
    classification: str = Field(
        description=(
            "Must be strictly classified as exactly one of: 'Constructive Criticism', "
            "'Sarcastic/Meme Noise', 'Unsubstantiated Hate', or 'Legitimate Praise'."
        )
    )
    underlying_issue: Optional[str] = Field(
        default=None,
        description=(
            "The underlying objective hardware defect, software bug, or firmware failure "
            "identified. Return null if classified as noise."
        )
    )
    severity_weight: int = Field(
        description=(
            "An integer rating from 1 to 5 indicating the critical nature of the issue "
            "(1=minor cosmetic nitpick, 5=catastrophic structural or hardware system failure)."
        )
    )
    source_url: str = Field(
        default="unknown",
        description=(
            "The exact URL or domain from which this critique was extracted. "
            "You must find this in the '--- SOURCE URL: <url> ---' header "
            "that immediately precedes the text block containing this insight."
        )
    )


class ModelForumAnalysis(BaseModel):
    """Structured output container for all triaged forum insights for one product."""
    product_name: str = Field(
        description="The exact model or candidate product name matching the state list."
    )
    verified_insights: List[ForumInsight] = Field(
        description="A collection of validated, meaningful insights extracted for this specific model."
    )


class SystemForumAnalysis(BaseModel):
    """Master batch wrapper — aggregates per-product analyses from a single LLM pass."""
    products_analysis: List[ModelForumAnalysis] = Field(
        description=(
            "The master array mapping individual critique breakdowns to each product "
            "candidate present in the batch text dump."
        )
    )


# ─── Phase 2.9: Single-Model Spec Extraction Schema ─────────────────────────

class SingleProductSpec(BaseModel):
    """Structured output for one product's extracted specification table."""
    product_name: str = Field(
        description="The exact product model name being extracted."
    )
    markdown_table: str = Field(
        description=(
            "The complete, extracted two-column Markdown table (Specification | Value) "
            "containing only factual technical data."
        )
    )


# ─── Singletons ──────────────────────────────────────────────────────────────
# Phase 2.98: _embeddings is pre-warmed at module-import time so that the first
# RAG chat turn never hits a cold-start freeze during active user interaction.
# All other singletons remain lazily initialised on first use.

_llm_base: ChatGoogleGenerativeAI | None = None
_llm_creative: ChatGoogleGenerativeAI | None = None
_extractor_llm = None
_embeddings: HuggingFaceEmbeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2",
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True},
)
_vectorstore: Chroma | None = None
_tavily: TavilyClient | None = None

# ChromaDB is thread-safe for reads; guard all writes explicitly.
_vault_write_lock = threading.Lock()


def _get_llm_base() -> ChatGoogleGenerativeAI:
    global _llm_base
    if _llm_base is None:
        _llm_base = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=os.environ.get("GEMINI_API_KEY"),
            temperature=0,
            thinking_budget=0,   # Disable dynamic thinking — prevents multi-minute hangs
                                  # on large context comparisons (Gemini 2.5 Flash default
                                  # burns thinking tokens proportional to context size).
            request_timeout=20.0, # Phase 2.98: hard socket drop at 20 s — prevents terminal hangs
        )
    return _llm_base


def _get_llm_creative() -> ChatGoogleGenerativeAI:
    global _llm_creative
    if _llm_creative is None:
        _llm_creative = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=os.environ.get("GEMINI_API_KEY"),
            temperature=0.4,
            thinking_budget=0,   # Disable thinking for fast interview question generation.
        )
    return _llm_creative


def _get_extractor_llm():
    global _extractor_llm
    if _extractor_llm is None:
        _extractor_llm = _get_llm_base().with_structured_output(ProductConstraints)
    return _extractor_llm


def _get_embeddings(embeddings: HuggingFaceEmbeddings | None = None) -> HuggingFaceEmbeddings:
    """Return the pre-warmed embedding model (loaded at module import).

    Phase 2.98: The global _embeddings singleton is now initialised eagerly at
    module-import time, eliminating cold-start thread hangs during active chat turns.
    Passing a custom `embeddings` instance overwrites the singleton (used at
    startup by main.py's configure_embeddings call).
    """
    global _embeddings
    if embeddings is not None:
        _embeddings = embeddings  # allow startup override
    return _embeddings


def _get_vectorstore(embeddings: HuggingFaceEmbeddings | None = None) -> Chroma:
    """Return (or create) the persistent ChromaDB collection."""
    global _vectorstore
    if _vectorstore is None:
        os.makedirs(VAULT_DIR, exist_ok=True)
        _vectorstore = Chroma(
            collection_name=VAULT_COLLECTION,
            embedding_function=_get_embeddings(embeddings),
            persist_directory=VAULT_DIR,
        )
    return _vectorstore


def configure_embeddings(embeddings: HuggingFaceEmbeddings) -> None:
    """Register a startup-loaded embedding model for graph-dispatched nodes."""
    _get_embeddings(embeddings)


def _get_tavily() -> TavilyClient:
    global _tavily
    if _tavily is None:
        api_key = os.environ.get("TAVILY_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "TAVILY_API_KEY is not set. "
                "Get a free key at https://app.tavily.com/home and add it to .env"
            )
        _tavily = TavilyClient(api_key=api_key)
    return _tavily


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _url_to_product_id(url: str) -> str:
    """Stable, short product ID derived from the URL."""
    return hashlib.md5(url.encode()).hexdigest()[:12]


def _url_already_vaulted(url: str) -> bool:
    """Return True if any document with this source_url is already in ChromaDB."""
    vs = _get_vectorstore()
    product_id = _url_to_product_id(url)
    results = vs.get(where={"product_id": product_id}, limit=1)
    return bool(results and results.get("ids"))


def _fetch_page_text(url: str, tavily: TavilyClient) -> str:
    """
    Fetch clean text from a URL.
    Strategy:
      1. Try Tavily extract (returns clean markdown/text).
      2. Fall back to requests + BeautifulSoup if Tavily extract fails.
    """
    try:
        result = tavily.extract(urls=[url])
        if result and result.get("results"):
            raw = result["results"][0].get("raw_content", "")
            if raw and len(raw) > 200:
                return raw
    except Exception:
        pass  # Fall through to BeautifulSoup

    try:
        headers = {"User-Agent": "Mozilla/5.0 (compatible; ProductBot/1.0)"}
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        # Remove script/style noise
        for tag in soup(["script", "style", "nav", "footer", "header"]):
            tag.decompose()
        return soup.get_text(separator="\n", strip=True)
    except Exception as exc:
        return f"[Content fetch failed: {exc}]"


def _ingest_url_to_vault(
    url: str,
    product_name: str,
    category: str,
    tavily: TavilyClient,
) -> int:
    """
    Fetch, split, tag, and upsert a product page into ChromaDB.
    Returns the number of chunks added (0 if already vaulted).
    """
    if _url_already_vaulted(url):
        return 0

    text = _fetch_page_text(url, tavily)
    if not text or text.startswith("[Content fetch failed"):
        return 0

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )
    chunks = splitter.split_text(text)
    if not chunks:
        return 0

    product_id = _url_to_product_id(url)
    metadatas = [
        {
            "product_id":   product_id,
            "product_name": product_name,
            "category":     category,
            "source_url":   url,
            "chunk_index":  i,
        }
        for i in range(len(chunks))
    ]

    vs = _get_vectorstore()
    # Use deterministic IDs so re-runs are idempotent
    ids = [f"{product_id}_chunk_{i}" for i in range(len(chunks))]
    vs.add_texts(texts=chunks, metadatas=metadatas, ids=ids)
    return len(chunks)


# ─── Node 1: Analyzer ────────────────────────────────────────────────────────

def analyzer_node(state: AgentState) -> Dict[str, Any]:
    """
    Extract product constraints from chat history and evaluate
    whether the user profile is complete enough to trigger a search.

    Returns
    -------
    dict with updated 'constraints' and 'is_profile_complete'.
    """
    system_prompt = SystemMessage(content=(
        "You are an expert product research assistant. "
        "Your task is to carefully read the conversation below and extract "
        "every product preference or constraint the user has mentioned — "
        "explicitly or implicitly. "
        "DO NOT auto-infer or hallucinate soft requirements. If the user says they are a 'content creator', do not automatically fill in 'good camera' or 'high performance'. Instead, leave those fields blank. "
        "Only populate a field if you have genuine explicit evidence from the conversation. "
        "Leave fields as null if there is no evidence."
    ))

    messages = [system_prompt] + state["chat_history"]

    # Extract constraints via structured output
    extracted: ProductConstraints = _get_extractor_llm().invoke(messages)

    # Merge with any constraints already collected in previous turns.
    # Rule: a newly extracted non-None value always overrides the old value.
    existing_raw = state.get("constraints", {})
    existing = ProductConstraints(**existing_raw) if existing_raw else ProductConstraints()

    merged_data = existing.model_dump()
    for field, value in extracted.model_dump().items():
        if value is not None and value != []:
            merged_data[field] = value

    merged = ProductConstraints(**merged_data)

    # Decide if we have enough to proceed
    is_complete = len(merged.filled_fields()) >= COMPLETION_THRESHOLD

    return {
        "constraints": merged.model_dump(),
        "is_profile_complete": is_complete,
    }


# ─── Node 2a: Question Generator ─────────────────────────────────────────────

def question_generator_node(state: AgentState) -> Dict[str, Any]:
    """
    Generate the single most impactful follow-up question to fill the
    most important missing constraint. Returns the question as an AIMessage
    appended to chat_history.
    """
    constraints = ProductConstraints(**state.get("constraints", {}))
    missing = constraints.missing_fields()
    filled = constraints.filled_fields()

    system_prompt = SystemMessage(content=(
        "You are an expert shopping concierge — knowledgeable, friendly, and concise. "
        "Your job is to gather enough information to make a perfect product recommendation. "
        "\n\n"
        "RULES:\n"
        "1. Ask ONLY ONE question per turn. Never ask two questions at once.\n"
        "2. Make the question feel natural and conversational — not like a form.\n"
        "3. Always offer 3\u20134 numbered options AND an 'open text' escape hatch "
        "   (e.g. '5. Something else \u2014 tell me!').\n"
        "4. Prioritise the most impactful missing detail: start with product_category, "
        "   then primary_use_case, then budget_max, then the rest.\n"
        "5. Never repeat a question that has already been answered.\n"
        "6. If the profile is not complete, actively ask clarifying questions about missing critical preferences, such as Operating System (iOS vs. Android), battery life, screen size, or storage capacity. Offer structured multiple-choice options for these new questions to guide the user effectively.\n"
        "7. When asking about budget or prices, ALWAYS use Indian Rupees (INR, \u20b9). Never use Dollars ($).\n"
        "8. Keep your response under 120 words."
    ))

    context_message = AIMessage(content=(
        f"[Internal context \u2014 do not reveal to user]\n"
        f"Already collected: {filled}\n"
        f"Still missing: {missing}\n"
        f"Current constraints: {constraints.model_dump()}"
    ))

    messages = [system_prompt] + state["chat_history"] + [context_message]

    response = _get_llm_creative().invoke(messages)
    question_text = response.content

    if isinstance(question_text, list):
        parts = []
        for p in question_text:
            if isinstance(p, str):
                parts.append(p)
            elif isinstance(p, dict) and "text" in p:
                parts.append(p["text"])
        question_text = "\n".join(parts)

    return {
        "chat_history": [AIMessage(content=question_text)],
    }


# ─── Node 2b: Search & Vault ─────────────────────────────────────────────────

def _extract_text_from_content(content: Any) -> str:
    """Normalise LLM response content to a plain string."""
    if isinstance(content, list):
        return " ".join(
            p if isinstance(p, str) else p.get("text", "") for p in content
        )
    return str(content)


COMPARISON_KEYWORDS = [
    "compare", "comparison", "vs", "versus", "difference", "better", "best",
    "table", "which", "all of them", "all phones", "all products", "each",
    "analysis", "breakdown", "side by side", "overview",
]

RECOMMENDATION_KEYWORDS = [
    "recommend", "recommendation", "suggest", "which one should i buy",
    "best for me", "verdict", "which is better for me", "what should i get",
    "final pick", "your pick", "advise", "advice", "should i buy", "choose",
    "which would you", "what would you",
]

FALLBACK_DIMENSIONS = [
    "performance benchmark score",
    "price cost value",
    "battery life endurance",
    "build quality materials",
    "key specifications features",
    "pros advantages strengths",
    "cons disadvantages weaknesses",
    "user review ratings",
]


def _has_intent(query: str, keywords: List[str]) -> bool:
    query_l = query.lower()
    return any(keyword in query_l for keyword in keywords)


def _strip_json_code_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _format_budget(constraints) -> str:
    min_b = constraints.budget_min
    max_b = constraints.budget_max
    if min_b and max_b:
        return f"\u20b9{int(min_b):,} \u2013 \u20b9{int(max_b):,}"
    elif max_b:
        return f"Up to \u20b9{int(max_b):,}"
    elif min_b:
        return f"Above \u20b9{int(min_b):,}"
    else:
        return "Not specified"


def _generate_spec_dimensions(constraints: ProductConstraints) -> List[str]:
    try:
        response = _get_llm_base().invoke([
            SystemMessage(content=(
                "You are a product specification expert. Return ONLY a JSON array "
                "of strings. No explanation, no markdown, no preamble."
            )),
            HumanMessage(content=(
                f"Product category: {constraints.product_category}\n"
                f"User context: {constraints.primary_use_case} \u2014 {constraints.additional_notes}\n\n"
                f"List the 7 to 9 most important technical specification dimensions a buyer\n"
                f"should compare when choosing between {constraints.product_category} products.\n\n"
                f"Rules:\n"
                f"- Each dimension must be 2 to 5 words, suitable for use in a search query\n"
                f"- Focus on specs that are objectively measurable and appear in product pages\n"
                f"- Tailor the list to the user context above\n"
                f"- Return ONLY a JSON array like: [\"dimension one\", \"dimension two\", ...]"
            )),
        ])
        raw_text = _strip_json_code_fence(_extract_text_from_content(response.content))
        parsed = json.loads(raw_text)
        dimensions = [
            item.strip()
            for item in parsed
            if isinstance(item, str) and 2 <= len(item.split()) <= 5
        ]
        return dimensions[:9] if len(dimensions) >= 7 else FALLBACK_DIMENSIONS
    except Exception:
        return FALLBACK_DIMENSIONS


# ─── Stage 2 Layer 1: Category-Aware Query Template Generation ───────────────

def _generate_harvest_queries(
    category: str,
    use_case: str,
    current_year: str,
) -> List[str]:
    """
    Generate 4-5 targeted search query TEMPLATES for harvesting complete
    technical specifications of a specific product model.

    Each template contains the placeholder {model} to be substituted at
    search time. Templates target different specification clusters so that
    together they cover the full specification surface of the category.

    Falls back to a generic set of 4 templates if the LLM call fails or
    returns fewer than 3 valid templates.
    """
    fallback = [
        "{model} full technical specifications India " + current_year,
        "{model} processor performance benchmark review India " + current_year,
        "{model} price features pros cons India " + current_year,
        "{model} user review rating long term India " + current_year,
    ]

    try:
        llm = _get_llm_base()
        prompt_user = (
            f"Product category: {category}\n"
            f"User context: {use_case}\n"
            f"Current year: {current_year}\n\n"
            f"Generate 4 to 5 targeted search query TEMPLATES for harvesting complete "
            f"technical specifications of a specific {category} model from the web.\n\n"
            f"Each template must:\n"
            f"- Contain the placeholder {{model}} where the product name will be inserted\n"
            f"- Target a DIFFERENT cluster of specifications (e.g., one for performance "
            f"benchmarks, one for display specs, one for pricing, one for user reviews "
            f"with pros and cons)\n"
            f"- Be phrased as a high-intent search query a tech journalist would use\n"
            f"- End with \"India {current_year}\" to ensure fresh, region-relevant results\n"
            f"- Be 6 to 12 words long\n\n"
            f"The templates must together cover the full specification surface of a "
            f"{category} product. Think about what data points a buyer comparing "
            f"{category} products would need: performance, display, battery/endurance, "
            f"connectivity, pricing, and user sentiment.\n\n"
            f"Tailor the spec clusters to what matters for {category} specifically \u2014 "
            f"do not use generic templates.\n\n"
            f"Return ONLY a JSON array of template strings with the {{model}} placeholder.\n"
            f"Example format: [\"{{model}} processor benchmark performance India 2026\", ...]"
        )

        response = llm.invoke([
            SystemMessage(content=(
                "You are a search query strategist for a product research engine. "
                "Return ONLY a JSON array of strings. No explanation, no markdown, "
                "no preamble."
            )),
            HumanMessage(content=prompt_user),
        ])

        raw_text = _strip_json_code_fence(_extract_text_from_content(response.content))
        parsed = json.loads(raw_text)

        valid = [
            item for item in parsed
            if isinstance(item, str) and "{model}" in item
        ]

        if len(valid) >= 3:
            return valid

        return fallback

    except Exception as exc:
        print(f"       \u26a0\ufe0f  _generate_harvest_queries failed ({exc}), using fallback templates.")
        return fallback


# ─── Stage 2 Layer 3a: Adaptive Content-Type Detection ───────────────────────

def _detect_content_type(text: str) -> str:
    """
    Returns 'spec_dense' or 'narrative' based on content analysis.

    Classifies a fetched page as spec-dense (lots of key-value pairs, table
    rows, or pipe-separated data) versus narrative (prose-heavy reviews).
    Spec-dense pages benefit from smaller chunks so individual spec rows
    are not split across chunk boundaries.
    """
    lines = text.split("\n")
    total_lines = max(len(lines), 1)
    # Count lines that look like key-value spec entries
    # (contain a colon or pipe character and are under 120 chars)
    kv_lines = sum(
        1 for line in lines
        if (":" in line or "|" in line) and len(line.strip()) < 120
        and len(line.strip()) > 3
    )
    kv_ratio = kv_lines / total_lines
    return "spec_dense" if kv_ratio > 0.25 else "narrative"


# ─── Stage 2 Layer 3b: Spec Card Synthesis ───────────────────────────────────

def _synthesise_spec_card(
    model_name: str,
    category: str,
    all_page_texts: List[str],
    llm,
) -> str | None:
    """
    Synthesise a structured Markdown specification table for a single product
    by asking the LLM to extract all factual specs from the raw page texts
    collected during the harvest loop.

    Returns the Markdown table string if successful, None otherwise.
    Truncates combined input to 12000 characters to stay within context limits.
    """
    if not all_page_texts:
        return None

    combined_text = "\n\n---\n\n".join(all_page_texts)
    combined_text = combined_text[:12000]  # hard cap for context safety

    try:
        response = llm.invoke([
            SystemMessage(content=(
                "You are a product specification extractor. "
                "Extract ONLY factual, objective specifications. "
                "Return a clean Markdown table with two columns: "
                "Specification | Value. "
                "Include every measurable spec you can find. "
                "Do not include opinions, marketing language, or prices in this table. "
                "If a value is not present in the text, omit that row entirely \u2014 "
                "do not write 'Not available'."
            )),
            HumanMessage(content=(
                f"Product: {model_name}\n"
                f"Category: {category}\n\n"
                f"Extract all technical specifications from the following page content "
                f"and return them as a two-column Markdown table (Specification | Value):\n\n"
                f"{combined_text}"
            )),
        ])

        spec_card_text = _extract_text_from_content(response.content).strip()
        if spec_card_text:
            return spec_card_text
        return None

    except Exception as exc:
        print(f"       \u26a0\ufe0f  _synthesise_spec_card failed for {model_name}: {exc}")
        return None


def _batch_synthesise_spec_cards(
    models_text_dict: Dict[str, str],
    category: str,
    llm,
) -> Dict[str, str]:
    """
    Synthesise spec cards for all models in a single LLM batch call.
    `models_text_dict` maps model_name to combined raw text.
    Returns a dictionary mapping model_name to its synthesised Markdown spec card.
    
    NOTE: Kept for reference. Production code now uses _parallel_synthesise_spec_cards.
    """
    if not models_text_dict:
        return {}

    corpus_parts = []
    for model_name, raw_text in models_text_dict.items():
        # Truncate each model's text corpus to 12,000 characters for safety
        truncated_text = raw_text[:12000]
        corpus_parts.append(f"Product Model Name: {model_name}\nCategory: {category}\nRaw Scraped Text:\n{truncated_text}")

    input_corpus = "\n\n========================================\n\n".join(corpus_parts)

    try:
        response = llm.invoke([
            SystemMessage(content=(
                "You are a Technical Data Extractor. I will provide raw scraped text for multiple products. "
                "Extract the specs for EACH product and return a structured JSON object mapping each product name to its Markdown Master Spec Sheet.\n\n"
                "Rules for each Markdown Master Spec Sheet:\n"
                "- Must be a clean Markdown table with exactly two columns: Specification | Value.\n"
                "- Extract ONLY factual, objective specifications. Include every measurable spec you can find.\n"
                "- Do not include opinions, marketing language, or prices in this table.\n"
                "- If a value is not present in the text, omit that row entirely \u2014 do not write 'Not available'.\n\n"
                "Your output MUST be a valid JSON object ONLY, mapping the exact product model names as keys "
                "to their respective Markdown specification tables as values. Do not wrap the JSON in "
                "markdown formatting or any explanation outside of the valid JSON structure."
            )),
            HumanMessage(content=(
                f"Extract specifications for the following products:\n\n{input_corpus}"
            )),
        ])

        raw_response = _extract_text_from_content(response.content).strip()
        cleaned_response = _strip_json_code_fence(raw_response)
        parsed_json = json.loads(cleaned_response)

        result_cards = {}
        for model_name in models_text_dict:
            matched_val = None
            for k, v in parsed_json.items():
                if k.strip().lower() == model_name.strip().lower():
                    matched_val = v
                    break
            if matched_val:
                result_cards[model_name] = matched_val.strip()
        return result_cards

    except Exception as exc:
        print(f"       \u26a0\ufe0f  _batch_synthesise_spec_cards failed: {exc}")
        return {}


def _parallel_synthesise_spec_cards(
    models_text_dict: Dict[str, str],
    category: str,
    llm,
) -> Dict[str, str]:
    """
    Parallel spec card synthesis — one LLM call per model, all running concurrently.

    Replaces the serial _batch_synthesise_spec_cards approach which sent all
    models in a single 72KB+ payload, causing sequential processing and long
    wait times. Running one 12KB call per model concurrently is both faster
    (parallel API calls) and more reliable (smaller context per call).

    Returns a dict mapping model_name -> Markdown spec card string.
    """
    if not models_text_dict:
        return {}

    results: Dict[str, str] = {}
    results_lock = threading.Lock()

    def _synth_one(model_name: str, raw_text: str) -> None:
        card = _synthesise_spec_card(
            model_name=model_name,
            category=category,
            all_page_texts=[raw_text],  # _synthesise_spec_card caps internally at 12 KB
            llm=llm,
        )
        if card:
            with results_lock:
                results[model_name] = card
                print(f"       \u2705  [{model_name}] spec card ready ({len(card)} chars)")

    n_workers = min(len(models_text_dict), 6)  # cap at 6 concurrent LLM calls
    with ThreadPoolExecutor(max_workers=n_workers) as ex:
        futures = [
            ex.submit(_synth_one, name, text)
            for name, text in models_text_dict.items()
        ]
        for f in as_completed(futures):
            try:
                f.result()
            except Exception as exc:
                print(f"       \u26a0\ufe0f  Parallel spec synthesis worker error: {exc}")

    return results



# ─── Parallel harvest helpers ────────────────────────────────────────────────

def _fetch_and_ingest_url(
    url: str,
    title: str,
    model: str,
    category: str,
    tavily: TavilyClient,
) -> Tuple[str, int, str, str]:
    """
    Fetch one URL, chunk it adaptively, write chunks to ChromaDB under lock.
    Returns (title_truncated, chunks_written, content_type, page_text_excerpt).
      chunks_written == -1  → already cached (vault hit, no write needed)
      chunks_written ==  0  → fetch failed or no chunks produced
    Called from a ThreadPoolExecutor worker thread.
    """
    if _url_already_vaulted(url):
        return (title[:55], -1, "cached", "")

    text = _fetch_page_text(url, tavily)
    if not text or text.startswith("[Content fetch failed"):
        return (title[:55], 0, "failed", "")

    content_type = _detect_content_type(text)
    if content_type == "spec_dense":
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=400,
            chunk_overlap=50,
            separators=["\n\n", "\n", "|", " "],
        )
    else:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=150,
            separators=["\n\n", "\n", ". ", " "],
        )

    chunks = splitter.split_text(text)
    if not chunks:
        return (title[:55], 0, content_type, text[:3000])

    product_id = _url_to_product_id(url)
    metadatas = [
        {
            "product_id":   product_id,
            "product_name": model,
            "category":     category,
            "source_url":   url,
            "chunk_index":  ci,
            "chunk_type":   content_type,
        }
        for ci in range(len(chunks))
    ]
    ids = [f"{product_id}_chunk_{ci}" for ci in range(len(chunks))]

    with _vault_write_lock:
        vs = _get_vectorstore()
        vs.add_texts(texts=chunks, metadatas=metadatas, ids=ids)

    return (title[:55], len(chunks), content_type, text[:3000])


def _harvest_single_model(
    model: str,
    harvest_queries: List[str],
    category: str,
    current_year: str,
    tavily: TavilyClient,
    llm,
) -> dict:
    """
    Run the full Layer 2+3 harvest pipeline for one product model.
    Designed to be called from a ThreadPoolExecutor worker thread.

    Returns a summary dict:
      {
        "model":           str,
        "urls_found":      int,
        "chunks_written":  int,
        "all_page_texts":  str,       # Aggregated page text corpus for batch synthesis
        "spec_card_chars": int,       # Set to 0, synthesised in batch later
        "error":           str | None,
      }
    """
    try:
        # Layer 2 — Multi-query execution with URL deduplication (parallel query execution)
        model_queries = [t.format(model=model) for t in harvest_queries]
        url_to_result: Dict[str, dict] = {}

        def _tavily_search_worker(q: str) -> List[dict]:
            try:
                resp = tavily.search(
                    query=q,
                    max_results=2,
                    search_depth="advanced",
                )
                return resp.get("results", [])
            except Exception:
                return []

        with ThreadPoolExecutor(max_workers=4) as search_executor:
            search_futures = [search_executor.submit(_tavily_search_worker, q) for q in model_queries]
            for future in as_completed(search_futures):
                results = future.result()
                for result in results:
                    url = result.get("url", "")
                    if url and url not in url_to_result:
                        url_to_result[url] = result

        total_chunks = 0
        all_page_texts: List[str] = []

        # Layer 3 — Parallel URL fetch+ingest (up to 4 workers per model)
        # A tiny stagger between submissions prevents the first URL from dropping
        # connection chunks due to Tavily burst-rate collisions.
        with ThreadPoolExecutor(max_workers=4) as url_executor:
            url_futures = {}
            for result in url_to_result.values():
                if result.get("url"):
                    time.sleep(random.uniform(0.1, 0.5))  # Tavily burst jitter
                    fut = url_executor.submit(
                        _fetch_and_ingest_url,
                        result.get("url", ""),
                        result.get("title", model),
                        model,
                        category,
                        tavily,
                    )
                    url_futures[fut] = result

            for future in as_completed(url_futures):
                try:
                    title_trunc, chunk_count, content_type, page_text = future.result()
                    if chunk_count > 0:
                        total_chunks += chunk_count
                    if page_text:
                        all_page_texts.append(page_text)
                except Exception:
                    pass

        # Layer 3b spec card synthesis is removed from here to prevent API rate limiting.
        # It is now processed in batch in search_and_vault_node.
        return {
            "model":           model,
            "urls_found":      len(url_to_result),
            "chunks_written":  total_chunks,
            "all_page_texts":  "\n\n---\n\n".join(all_page_texts),
            "spec_card_chars": 0,
            "error":           None,
        }

    except Exception as exc:
        return {
            "model":           model,
            "urls_found":      0,
            "chunks_written":  0,
            "all_page_texts":  "",
            "spec_card_chars": 0,
            "error":           str(exc),
        }


def search_and_vault_node(
    state: AgentState,
    embeddings: HuggingFaceEmbeddings | None = None,
) -> Dict[str, Any]:
    """
    Phase 2.5 \u2014 Four-Layer Product Harvesting Engine.

    STAGE 1 \u2014 Product Discovery:
      1a. LLM generates a broad, India-centric discovery query.
      1b. Tavily returns top article snippets.
      1c. LLM (Product Curator) extracts 5-6 specific qualifying models.

    STAGE 2 \u2014 Per-Product Spec Harvester (four layers):
      Layer 1 \u2014 Category-aware query template generation (one LLM call).
      Layer 2 \u2014 Multi-query execution with URL deduplication per model.
      Layer 3 \u2014 Adaptive chunking + spec card synthesis per model.
      Layer 4 \u2014 Post-harvest coverage verification + supplementary search.

    STAGE 3 \u2014 State Update:
      Set retrieved_products to the curated model list and flip is_rag_mode.
    """
    if embeddings is not None:
        _get_embeddings(embeddings)

    constraints = ProductConstraints(**state.get("constraints", {}))
    tavily = _get_tavily()
    llm = _get_llm_base()

    current_month = datetime.now().strftime("%B")
    current_year  = datetime.now().strftime("%Y")

    category_str  = constraints.product_category or "product"
    use_case_str  = constraints.primary_use_case  or "general use"

    if constraints.budget_min and constraints.budget_max:
        budget_range = f"\u20b9{int(constraints.budget_min):,} to \u20b9{int(constraints.budget_max):,} INR"
    elif constraints.budget_max:
        budget_range = f"up to \u20b9{int(constraints.budget_max):,} INR"
    elif constraints.budget_min:
        budget_range = f"at least \u20b9{int(constraints.budget_min):,} INR"
    else:
        budget_range = "any budget"

    budget_ceil = int(constraints.budget_max) + 5000 if constraints.budget_max else None
    budget_ceil_str = f"\u20b9{budget_ceil:,} INR" if budget_ceil else "unlimited"

    constraints_summary = (
        f"Product: {category_str}\n"
        f"Use case: {use_case_str}\n"
        f"Budget: {budget_range}\n"
        f"Form factor: {constraints.form_factor or 'any'}\n"
        f"Preferred brands: {', '.join(constraints.preferred_brands) if constraints.preferred_brands else 'none'}\n"
        f"Additional notes: {constraints.additional_notes or 'none'}"
    )

    # ══════════════════════════════════════════════════════════════════════════
    # STAGE 1 \u2014 PRODUCT DISCOVERY
    # ══════════════════════════════════════════════════════════════════════════

    print(f"\n  {'\u2550'*58}")
    print(f"  \ud83d\udce1  STAGE 1 \u2014 Product Discovery")
    print(f"  {'\u2550'*58}")

    query_gen_prompt = SystemMessage(content=(
        f"The current date is {current_month} {current_year}. "
        "You MUST append the current year to your search queries so the search engine "
        "prioritises live, contemporary models currently circulating in the market.\n\n"
        "Your target audience is the Indian consumer ecosystem. "
        "All pricing must align with Indian market metrics (INR / \u20b9).\n\n"
        "QUERY CONSTRUCTION RULES:\n"
        "1. Generate a clean, natural, high-intent discovery search query.\n"
        "   Example: 'best gaming smartphones under 60000 INR India 2026'\n"
        "2. DO NOT include website or domain names in the search string.\n"
        "3. Keep the query concise and semantically focused.\n"
        "4. End with the current year and 'India'.\n\n"
        "OUTPUT FORMAT: Return ONLY the raw search query string. No quotes, no explanation."
    ))

    try:
        q_resp = llm.invoke([
            query_gen_prompt,
            HumanMessage(content=(
                f"Generate a broad discovery search query for:\n\n{constraints_summary}"
            )),
        ])
        discovery_query = _extract_text_from_content(q_resp.content).strip().strip('"').strip("'")
    except Exception:
        parts = [category_str]
        if use_case_str != "general use":
            parts.append(f"for {use_case_str}")
        if constraints.budget_max:
            parts.append(f"under \u20b9{int(constraints.budget_max):,}")
        discovery_query = f"best {' '.join(parts)} India {current_year}"

    print(f"\n  \ud83d\udd0d  Discovery Query: \"{discovery_query}\"")
    print("  \u23f3  Searching\u2026\n")

    try:
        search_resp = tavily.search(
            query=discovery_query,
            max_results=TAVILY_MAX_RESULTS,
            search_depth="advanced",
            include_answer=False,
        )
        raw_results = search_resp.get("results", [])
    except Exception as exc:
        print(f"  \u26a0\ufe0f  Tavily search failed: {exc}")
        raw_results = []

    if not raw_results:
        error_msg = (
            "\u26a0\ufe0f  I wasn't able to fetch live product data right now. "
            "Please check your TAVILY_API_KEY and internet connection, then try again."
        )
        return {
            "chat_history": [AIMessage(content=error_msg)],
            "retrieved_products": [],
            "is_rag_mode": False,
        }

    snippet_corpus = "\n\n".join(
        f"[Source {i+1}] {r.get('title', '')}\n{r.get('content', '')[:600]}"
        for i, r in enumerate(raw_results)
        if r.get("url")
    )

    curator_prompt = SystemMessage(content=(
        f"You are an intelligent Product Curator. Scan the web snippets and identify "
        f"5 to 6 specific, real-world {category_str} models that best match:\n"
        f"  \u2022 Budget: {budget_range} (hard ceiling: {budget_ceil_str})\n"
        f"  \u2022 Use case: {use_case_str}\n\n"
        "**Rules:**\n"
        f"1. **Output Quota:** Return EXACTLY 5 to 6 model names.\n"
        f"2. **Budget Gate (NO GUESSING):** Ceiling is {budget_ceil_str}. "
        "If the text explicitly says a price above this, drop it. "
        "CRITICAL: If the price is NOT stated in the text AND you are not 100% certain "
        "the Indian retail price is under the ceiling, EXCLUDE it.\n"
        f"3. **Use-Case Inference:** For '{use_case_str}', a flagship processor "
        "(SD 8 Gen 3+, Dimensity 9300+), advanced cooling, or 144Hz+ screen qualifies.\n"
        "4. **Recency:** Only currently recommended models. Ignore historical references.\n"
        "5. **ENFORCE BRAND DIVERSITY (CRITICAL):** Your final list MUST span multiple "
        "different manufacturers/brands (e.g., Lenovo, ASUS, Acer, HP, MSI, Dell). "
        "Do NOT fill the list with products from a single brand family. Each slot must "
        "represent a genuinely different competitor.\n"
        "6. **NO SKU DUPLICATION (CRITICAL):** Do NOT list multiple sub-models or "
        "configurations of the same product family. If you see 'HP Victus 15-AX' and "
        "'HP Victus 15-BX', extract only the single best representative ('HP Victus 15') "
        "and use the remaining slots for entirely different brands.\n"
        "7. Return ONLY a clean, comma-separated list of model names \u2014 no numbering, "
        "no bullets, no explanation. If fewer than 5 qualify, return whatever does. "
        "If nothing qualifies, return: NONE"
    ))

    extracted_models_str = ""
    try:
        curator_resp = llm.invoke([
            curator_prompt,
            HumanMessage(content=(
                f"Extract qualifying {category_str} models from these snippets:\n\n{snippet_corpus}"
            )),
        ])
        extracted_models_str = _extract_text_from_content(curator_resp.content).strip()
    except Exception:
        extracted_models_str = ""

    discovered_models: List[str] = (
        []
        if not extracted_models_str or extracted_models_str.upper() == "NONE"
        else [
            name.strip() for name in extracted_models_str.split(",")
            if name.strip() and len(name.strip()) > 2
        ]
    )

    if not discovered_models:
        discovered_models = [r.get("title", f"Product {i+1}")[:80] for i, r in enumerate(raw_results[:6])]

    print(f"  ✅  Discovered {len(discovered_models)} candidates:")
    for i, m in enumerate(discovered_models, 1):
        print(f"       {i}. {m}")
    print()

    # ══════════════════════════════════════════════════════════════════════════
    # STAGE 2 — PER-PRODUCT SPEC HARVESTER (FOUR-LAYER SYSTEM)
    # ══════════════════════════════════════════════════════════════════════════
    print(f"  {'\u2550'*58}")
    print(f"  🗄️  STAGE 2 — Specification Harvester")
    print(f"  {'\u2550'*58}\n")

    category = category_str
    vaulted_count = 0

    # ── Layer 1: Generate category-aware query templates (one LLM call) ───────
    harvest_queries = _generate_harvest_queries(category, use_case_str, current_year)

    print(f"  📋  Harvest query templates ({len(harvest_queries)}):")
    for t in harvest_queries:
        print(f"       • {t.replace('{model}', '[model]')}")
    print()

    # ── Layers 2 & 3 — Parallel harvest (2 models concurrently) ──────────────
    # max_workers=2 balances Tavily rate limits against speed.
    # Each worker itself spawns up to 4 URL-fetch sub-threads.
    harvest_results: Dict[str, dict] = {}

    print(f"  ⚡  Harvesting {len(discovered_models)} models in parallel "
          f"({len(discovered_models)} concurrent)...\n")

    with ThreadPoolExecutor(max_workers=max(1, len(discovered_models))) as model_executor:
        model_futures = {
            model_executor.submit(
                _harvest_single_model,
                model,
                harvest_queries,
                category,
                current_year,
                tavily,
                llm,
            ): model
            for model in discovered_models
        }

        for future in as_completed(model_futures):
            model = model_futures[future]
            try:
                result = future.result()
                harvest_results[model] = result
                vaulted_count += result["chunks_written"]

                status = "✅" if not result["error"] else "⚠️ "
                print(
                    f"  {status}  {model:<45} "
                    f"{result['chunks_written']} chunks | "
                    f"{result['urls_found']} URLs"
                )
                if result["error"]:
                    print(f"       ⚠️  Error: {result['error']}")

            except Exception as exc:
                print(f"  ⚠️   {model}: unexpected error — {exc}")
                harvest_results[model] = {
                    "model": model, "urls_found": 0,
                    "chunks_written": 0, "all_page_texts": "", "spec_card_chars": 0, "error": str(exc)
                }

    print()

    # ── Stage 2 Layer 3b: Sequential Spec Synthesis (Phase 2.9) ──────────────
    # DESIGN RATIONALE: The previous parallel batch call caused Attention Degradation —
    # the LLM skipped specs for the first model and produced empty/truncated tables.
    # We now invoke ONE structured LLM call per model sequentially, with a 3-second
    # inter-call sleep to safely clear Gemini's Free Tier burst rate limits (429).
    spec_llm = llm.with_structured_output(SingleProductSpec)

    models_to_synthesise = [
        m for m in discovered_models
        if harvest_results.get(m, {}).get("all_page_texts")
    ]

    if models_to_synthesise:
        print(f"  🧠  Sequential spec extraction for {len(models_to_synthesise)} model(s) "
              f"(3 s rate-limit gap between calls)...\n")

        for model in models_to_synthesise:
            raw_text = harvest_results[model]["all_page_texts"]
            corpus_snippet = raw_text[:12000]

            print(f"       ⏳  Extracting spec card: {model}")
            try:
                spec_result: SingleProductSpec = spec_llm.invoke([
                    SystemMessage(content=(
                        "You are a product specification extractor. "
                        "Extract ONLY factual, objective specifications from the provided text. "
                        "Return a clean Markdown table with two columns: Specification | Value. "
                        "Include every measurable spec you can find. "
                        "Do not include opinions, marketing language, or prices in this table. "
                        "If a value is not present in the text, omit that row entirely — "
                        "do not write 'Not available'. "
                        "Populate product_name with the exact model name provided in the prompt. "
                        "FIELD STANDARDIZATION RULE: To prevent comparison matrix lookups from "
                        "returning 'Not available in data', you must enforce strict standardization "
                        "of column keys. For any graphics components, processing units, or video "
                        "cards, always use the explicit column key string 'Graphics Processor (GPU)'. "
                        "Never leave this field blank if the raw text segments contain any details "
                        "on GPU configurations, GPU models, or graphics options."
                    )),
                    HumanMessage(content=(
                        f"Product: {model}\n\n"
                        f"Extract all technical specifications from the following scraped text "
                        f"and return them as a Markdown table (Specification | Value):\n\n"
                        f"{corpus_snippet}"
                    )),
                ])

                spec_card_text = spec_result.markdown_table.strip() if spec_result.markdown_table else ""

                if spec_card_text:
                    spec_card_id   = f"speccard_{_url_to_product_id(model)}"
                    spec_card_meta = {
                        "product_id":   _url_to_product_id(model),
                        "product_name": model,
                        "category":     category,
                        "source_url":   "synthesised_spec_card",
                        "chunk_index":  0,
                        "chunk_type":   "spec_card",
                    }
                    with _vault_write_lock:
                        vs_inner = _get_vectorstore()
                        vs_inner.add_texts(
                            texts=[spec_card_text],
                            metadatas=[spec_card_meta],
                            ids=[spec_card_id],
                        )
                    harvest_results[model]["spec_card_chars"] = len(spec_card_text)
                    print(f"       ✅  Spec card vaulted for {model} ({len(spec_card_text)} chars)")
                else:
                    print(f"       ⚠️  Empty spec card returned for {model} — skipping vault.")

            except Exception as exc:
                print(f"       ⚠️  Spec extraction failed for {model}: {exc}")

            # ── CRITICAL: 3-second sleep to bypass Gemini 429 burst rate limits ──
            time.sleep(3)

        print()

    # ══════════════════════════════════════════════════════════════════════════
    # LAYER 4 \u2014 POST-HARVEST COVERAGE VERIFICATION
    # ══════════════════════════════════════════════════════════════════════════
    print(f"\n  {'\u2550'*58}")
    print(f"  \ud83d\udd0d  STAGE 3 \u2014 Coverage Verification")
    print(f"  {'\u2550'*58}\n")

    vs = _get_vectorstore()
    underserved_models: List[str] = []

    for model in discovered_models:
        results = vs.get(where={"product_name": model})
        chunk_count = len(results.get("ids", []))

        status = "\u2705" if chunk_count >= MIN_CHUNKS_PER_PRODUCT else "\u26a0\ufe0f "
        print(f"  {status}  {model:<45} {chunk_count} chunks")

        if chunk_count < MIN_CHUNKS_PER_PRODUCT:
            underserved_models.append(model)

    if underserved_models:
        print(f"\n  \ud83d\udd04  Running supplementary search for {len(underserved_models)} underserved model(s)...")

        for model in underserved_models:
            supplementary_query = (
                f"{model} specifications technical details "
                f"India {current_year}"
            )
            print(f"  \ud83d\udd0e  Supplementary: \"{supplementary_query}\"")

            try:
                supp_resp = tavily.search(
                    query=supplementary_query,
                    max_results=3,
                    search_depth="advanced",
                )
                supp_results = supp_resp.get("results", [])

                supp_texts: List[str] = []
                for supp_result in supp_results:
                    url = supp_result.get("url", "")
                    if not url or _url_already_vaulted(url):
                        continue
                    text = _fetch_page_text(url, tavily)
                    if text and not text.startswith("[Content fetch failed"):
                        supp_texts.append(text[:3000])
                        splitter = RecursiveCharacterTextSplitter(
                            chunk_size=400, chunk_overlap=50
                        )
                        chunks = splitter.split_text(text)
                        product_id = _url_to_product_id(url)
                        metadatas = [
                            {
                                "product_id":   product_id,
                                "product_name": model,
                                "category":     category_str,
                                "source_url":   url,
                                "chunk_index":  ci,
                                "chunk_type":   "supplementary",
                            }
                            for ci in range(len(chunks))
                        ]
                        ids = [f"{product_id}_supp_{ci}" for ci in range(len(chunks))]
                        with _vault_write_lock:
                            vs.add_texts(texts=chunks, metadatas=metadatas, ids=ids)
                        print(f"       \u2705  Supplementary: {len(chunks)} chunks added for {model}")
            except Exception as exc:
                print(f"       \u26a0\ufe0f  Supplementary search failed for {model}: {exc}")

    print()

    # ══════════════════════════════════════════════════════════════════════════
    # STAGE 3 \u2014 STATE UPDATE & UI SUMMARY
    # ══════════════════════════════════════════════════════════════════════════
    canonical_products: List[Dict[str, Any]] = [
        {"name": m, "url": "", "snippet": ""} for m in discovered_models
    ]

    product_list_md = "\n".join(
        f"{i+1}. **{m}**" for i, m in enumerate(discovered_models)
    )

    overview = (
        f"\ud83e\udde0 **Product Intelligence Vault is ready!** "
        f"I've deeply indexed specifications for {len(discovered_models)} products "
        f"({vaulted_count} page(s) vaulted).\n\n"
        f"**\ud83d\udcf1 Discovered Models:**\n{product_list_md}\n\n"
        "You can now ask me anything \u2014 comparisons, specs, pros & cons, battery life, "
        "price breakdown \u2014 and I'll answer strictly from the crawled data."
    )

    separator = "\u2500" * 60
    print(f"\n{separator}")
    print("  \u2705  USER PROFILE COMPLETE \u2014 Vault Populated")
    print(separator)
    for field, label in {
        "product_category": "Product Category",
        "budget_max":       "Budget Max (INR)",
        "primary_use_case": "Primary Use Case",
        "form_factor":      "Form Factor",
        "additional_notes": "Additional Notes",
    }.items():
        value = getattr(constraints, field)
        if value is not None and value != []:
            print(f"  {label:<22}: {value}")
    print(f"{separator}\n")

    return {
        "chat_history":       [AIMessage(content=overview)],
        "retrieved_products": canonical_products,
        "is_rag_mode":        True,
    }


# ─── Node 3: Comparison Agent (RAG) ──────────────────────────────────────────

def comparison_agent_node(
    state: AgentState,
    query: str | None = None,
    embeddings: HuggingFaceEmbeddings | None = None,
) -> Dict[str, Any]:
    """
    Answers product comparison queries strictly grounded in vault data.

    1. Expands the user's query with extracted model names to guarantee
       semantic hits even for terse questions like "compare specs".
    2. Retrieves the top-k most relevant chunks from ChromaDB (no brittle
       metadata filter \u2014 the expanded query + LLM guardrails handle scoping).
    3. Calls Gemini with a strict, model-list-aware system prompt.
    4. Returns the grounded response as an AIMessage.
    """
    if embeddings is not None:
        _get_embeddings(embeddings)

    history = state.get("chat_history", [])
    user_query = query or ""
    if not user_query:
        for msg in reversed(history):
            if isinstance(msg, HumanMessage):
                user_query = msg.content
                break

    if not user_query:
        return {"chat_history": [AIMessage(content="Please ask me a question about the products.")]}

    vs = _get_vectorstore(embeddings)
    constraints = ProductConstraints(**state.get("constraints", {}))
    has_comparison_intent = _has_intent(user_query, COMPARISON_KEYWORDS)
    has_recommendation_intent = _has_intent(user_query, RECOMMENDATION_KEYWORDS)

    # ── Query Expansion ───────────────────────────────────────────────────────
    retrieved_products = state.get("retrieved_products", [])
    extracted_model_names = [p.get("name") for p in retrieved_products if p.get("name")]

    if extracted_model_names:
        models_suffix = " ".join(extracted_model_names)
        expanded_query = f"{user_query} for {models_suffix}"
    else:
        expanded_query = user_query

    # ── Retrieval strategy ────────────────────────────────────────────────────
    # Comparison queries: fetch pre-synthesised spec cards via metadata filter
    # (fast DB lookup, zero CPU embedding), then supplement with one targeted
    # similarity search for the specific aspect the user asked about.
    # Non-comparison queries: single similarity search only.

    docs = []

    if has_comparison_intent and extracted_model_names:

        # Step 1 — Retrieve spec cards by metadata (no embedding computation)
        class _FakeDoc:  # lightweight stand-in for langchain Document
            def __init__(self, content: str, metadata: dict) -> None:
                self.page_content = content
                self.metadata     = metadata

        spec_card_docs = []
        for model_name in extracted_model_names:
            try:
                sc_result = vs.get(
                    where={
                        "$and": [
                            {"product_name": {"$eq": model_name}},
                            {"chunk_type":   {"$eq": "spec_card"}},
                        ]
                    }
                )
                if sc_result and sc_result.get("documents"):
                    for doc_text, meta in zip(
                        sc_result["documents"], sc_result["metadatas"]
                    ):
                        spec_card_docs.append(_FakeDoc(doc_text, meta))
            except Exception:
                pass

        # Step 2 — One targeted similarity search for the user's specific question
        # Phase 2.98: Pass ONLY the raw user query string to the embedding engine.
        # Passing `expanded_query` (which appends all model names) or any part of
        # the chat history causes the CPU embedding model to tokenise a large string
        # on the second turn, producing a thread-calculation hang on cold hardware.
        try:
            similarity_docs = vs.similarity_search(user_query, k=RAG_TOP_K)
        except Exception:
            similarity_docs = []

        # Step 3 — Combine: spec cards first, then de-duplicated similarity hits
        seen_contents = {doc.page_content for doc in spec_card_docs}
        deduped_similarity = [
            doc for doc in similarity_docs
            if doc.page_content not in seen_contents
        ]
        docs = spec_card_docs + deduped_similarity

    else:
        # Non-comparison query: single similarity search
        # Phase 2.98: use only the raw user query — not the expanded form — to
        # keep the embedding payload minimal and avoid CPU thread hangs.
        try:
            docs = vs.similarity_search(user_query, k=RAG_TOP_K)
        except Exception:
            docs = []

    if not docs:
        no_data_msg = (
            "\u26a0\ufe0f I couldn't find relevant information in the Product Intelligence Vault "
            "for your query. Try rephrasing, or ask about a specific product or spec."
        )
        return {"chat_history": [AIMessage(content=no_data_msg)]}

    # ── Build context block ───────────────────────────────────────────────────
    context_parts = []
    for doc in docs:
        meta     = doc.metadata
        src_name = meta.get("product_name", "Unknown Product")
        src_url  = meta.get("source_url", "")
        context_parts.append(
            f"### Source: {src_name}\n(URL: {src_url})\n\n{doc.page_content}"
        )
    context_block = "\n\n---\n\n".join(context_parts)

    # ── System prompt ─────────────────────────────────────────────────────────
    models_str = ", ".join(extracted_model_names) if extracted_model_names else "None listed"
    user_context_block = ""
    recommendation_rule = "6. Do not include a final recommendation unless the user explicitly asks for one."

    if has_recommendation_intent:
        user_context_block = (
            f"The user's profile is:\n"
            f"- Product category: {constraints.product_category or 'Not specified'}\n"
            f"- Primary use case: {constraints.primary_use_case or 'Not specified'}\n"
            f"- Additional context: {constraints.additional_notes or 'None'}\n"
            f"- Budget: {_format_budget(constraints)}\n\n"
            f"Frame your recommendation specifically around this use case and profile.\n"
            f"Identify which specs matter most FOR THIS USER given their context —\n"
            f"do not default to generic importance rankings.\n"
            f"Make a clear, justified final recommendation. Do not hedge with\n"
            f"'if X matters consider Y'. Pick one product and explain why using\n"
            f"only the retrieved data.\n"
            f"If a product exceeds the stated budget, flag it clearly in your answer.\n\n"
        )
        recommendation_rule = (
            "6. End with a clear, justified final recommendation based only on "
            "the crawled data and the user's profile."
        )

    system_prompt = SystemMessage(content=(
        user_context_block +
        "You are an expert product concierge. "
        "You have been given excerpts scraped directly from product review pages and spec sheets. "
        "\n\n"
        f"You are ONLY discussing the models the user has requested: {models_str}. "
        "You are strictly FORBIDDEN from discussing or introducing any other models "
        "that might appear in the raw text chunks if they are not in this list.\n\n"
        "RULES \u2014 follow them without exception:\n"
        "1. Review the retrieved text chunks and answer the user's question.\n"
        "2. Present a clean markdown comparison table when comparing multiple products.\n"
        "3. Only discuss the models listed above. Do NOT introduce any others.\n"
        "4. If a spec is missing for a specific model in the context, write exactly: "
        "   'Not available in data' \u2014 do NOT guess or hallucinate.\n"
        "5. Be concise and factual \u2014 no marketing language.\n"
        f"{recommendation_rule}"
    ))

    context_message = HumanMessage(content=(
        f"[VAULT CONTEXT]\n\n{context_block}\n\n"
        f"[USER QUESTION]\n{user_query}"
    ))

    # Phase 2.98: Inject only the last 4 messages from chat history into the
    # LLM synthesis prompt, and hard-truncate each message body to 2 000 chars.
    # This prevents prior-turn markdown comparison tables (which can be 10 KB+)
    # from ballooning the context payload sent to Gemini and triggering a socket
    # hang or a thinking-token explosion on the second RAG turn.
    recent_history = []
    if history:
        history_to_consider = history[:-1] if len(history) > 0 else history
        raw_slice = history_to_consider[-4:]
        for msg in raw_slice:
            raw_content = msg.content
            # Flatten list-format content (Gemini multi-part) to plain text
            if isinstance(raw_content, list):
                raw_content = " ".join(
                    p if isinstance(p, str) else p.get("text", "") for p in raw_content
                )
            truncated = str(raw_content)[:2000]
            # Reconstruct as the same message type with truncated body
            if isinstance(msg, HumanMessage):
                recent_history.append(HumanMessage(content=truncated))
            else:
                recent_history.append(AIMessage(content=truncated))

    messages = [system_prompt] + recent_history + [context_message]

    response = _get_llm_base().invoke(messages)
    answer_text = response.content

    if isinstance(answer_text, list):
        parts = []
        for p in answer_text:
            if isinstance(p, str):
                parts.append(p)
            elif isinstance(p, dict) and "text" in p:
                parts.append(p["text"])
        answer_text = "\n".join(parts)

    return {
        "chat_history": [AIMessage(content=answer_text)],
    }



# ─── Phase 2.75: Single-Request Tavily Harvester + Single-Pass LLM Triage ───────

def _harvest_and_triage_forum_data(
    products: List[str],
    category: str,
    tavily: TavilyClient,
    llm,
) -> int:
    """
    Hyper-efficient single-request Tavily forum harvester for Devil's Advocate Mode.

    Phase 2.75 Architecture — two hard constraints:
      1. ONE Tavily advanced search per product (max_results=4, natural-language query).
         Source URLs are stamped directly into the corpus as '--- SOURCE URL: <url> ---'
         headers so the LLM can extract and propagate them per insight.
      2. ONE LLM call for the ENTIRE product batch — uses SystemForumAnalysis
         structured output (Gemini Rate Guard). source_url is now a first-class
         field in ForumInsight and is stored in ChromaDB metadata.

    Pipeline
    --------
    For each uncached product:
      A. Fire tavily.search(natural-language query, max_results=4, search_depth='advanced').
      B. Stamp each result as: [PRODUCT: <name>] / --- SOURCE URL: <url> --- / <content>

    After all products are collected:
      C. Build ONE combined corpus string.
      D. Fire EXACTLY ONE structured LLM call → SystemForumAnalysis.
      E. Vault each insight with its source_url in ChromaDB metadata.

    Returns
    -------
    int — total number of forum critique documents vaulted.
    """
    vs = _get_vectorstore()
    total_vaulted = 0

    # ── Step 1: Resolve which products need fresh data (cache check) ──────────
    products_to_fetch: List[str] = []
    for product in products:
        existing = vs.get(
            where={
                "$and": [
                    {"product_name": {"$eq": product}},
                    {"chunk_type":   {"$eq": "forum_critique"}},
                ]
            },
            limit=1,
        )
        if existing and existing.get("ids"):
            cached_count = len(
                vs.get(
                    where={
                        "$and": [
                            {"product_name": {"$eq": product}},
                            {"chunk_type":   {"$eq": "forum_critique"}},
                        ]
                    }
                ).get("ids", [])
            )
            print(f"       ✅  Forum cache hit for '{product}' ({cached_count} insights already vaulted)")
            total_vaulted += cached_count
        else:
            products_to_fetch.append(product)

    if not products_to_fetch:
        print("       ✅  All products already cached — no new fetches required.")
        return total_vaulted

    # ── Step 2: Per-product single Tavily request, URL-stamped corpus build ────
    combined_corpus = ""

    for product in products_to_fetch:
        print(f"\n       📡  [{product}] Executing Tavily community feedback query...")
        query = f"what are all the problems faced by the users of {product} on reddit"

        # Retry loop — absorbs transient ConnectionResetError (10054) socket drops
        # so a single dropped connection never leaves a product with zero forum data.
        max_retries = 3
        resp = None
        for attempt in range(max_retries):
            try:
                resp = tavily.search(
                    query=query,
                    max_results=6,
                    search_depth="advanced",
                )
                break  # Success — exit retry loop
            except Exception as exc:
                if attempt == max_retries - 1:
                    print(f"       ⚠️  Tavily final failure for '{product}' after {max_retries} attempts: {exc}")
                    resp = {"results": []}
                else:
                    print(f"       🔄  Tavily attempt {attempt + 1} failed for '{product}' ({exc}) — retrying in 1.5 s...")
                    time.sleep(1.5)

        results = resp.get("results", []) if resp else []
        if not results:
            print(f"       ⚠️  No Tavily results returned for '{product}'.")
            continue

        # Open the product section in the corpus
        combined_corpus += f"\n\n{'=' * 60}\n[PRODUCT: {product}]\n{'=' * 60}\n"

        for result in results:
            url     = result.get("url", "unknown")
            content = result.get("content", "") or result.get("snippet", "")
            if content:
                combined_corpus += (
                    f"\n\n--- SOURCE URL: {url} ---\n"
                    f"{content}"
                )

    if not combined_corpus.strip():
        print("       ⚠️  No raw forum data collected across all products — aborting triage.")
        return total_vaulted

    # ── Step 3: SINGLE LLM CALL — Gemini Rate Guard ───────────────────────────
    products_list_str = ", ".join(products_to_fetch)
    print(f"\n       🧠  Firing single structured LLM pass for [{products_list_str}]...")

    batch_llm = llm.with_structured_output(SystemForumAnalysis)

    triage_system_prompt = SystemMessage(content=(
        "You are an Elite Linguistic Quality Evaluator auditing a large collection of web "
        "and forum text about multiple distinct products simultaneously.\n"
        "Your mission is to split this corpus by product name, run semantic triage, and "
        "separate factual critique from online noise.\n\n"
        "CORPUS STRUCTURE: Product sections are demarcated by [PRODUCT: <name>] headers. "
        "Within each section, individual sources are preceded by '--- SOURCE URL: <url> ---' headers. "
        "You MUST populate the source_url field of each ForumInsight with the URL from the "
        "nearest preceding SOURCE URL header above that text segment.\n\n"
        "Apply these zero-tolerance filtering rules:\n\n"
        "SARCASM / HYPERBOLE DECRYPTION: Classify as 'Constructive Criticism', normalize the "
        "underlying issue (e.g., 'Thermal Profiles / Heavy Heat Dissipation'), record a high "
        "severity rating, but strip all hyperbole from raw_quote.\n\n"
        "UNSUBSTANTIATED HATE FILTER: Blind brand hate without naming a specific component error, "
        "lag pattern, or design failure → classify as 'Unsubstantiated Hate', severity_weight=1, "
        "underlying_issue=null.\n\n"
        "LEGITIMATE CRITIQUES: Isolate explicit hardware defects, software bugs, display tint "
        "issues, tracking dropouts, thermal throttling, battery drain, build quality failures, "
        "or any verifiable component failure.\n\n"
        "STRICT CROSS-MODEL ATTRIBUTION GUARD: If a forum critique discusses a product family "
        "generally without specifying the explicit technical part number (e.g., 'HP Victus 15'), "
        "do NOT copy the exact same complaint text block across multiple models. Assign the "
        "generic flaw ONLY to the primary model that is the best match, or group them under a "
        "unified attribute for that primary model. Do not duplicate identical raw_quote strings "
        "across different models.\n\n"
        "STRUCTURAL AMBIGUITY ELIMINATION FILTER: Maintain a zero-tolerance boundary for vague "
        "expressions. If a text block contains phrases like 'big problem' or 'awful system' "
        "without explicitly identifying the mechanical feature, software module, or component "
        "defect that is broken, you MUST classify it as 'Unsubstantiated Hate' and drop it "
        "entirely. Only retain critiques where the specific failing component or behaviour is "
        "named.\n\n"
        f"Products in this batch: {products_list_str}\n"
        "Return a SystemForumAnalysis with one ModelForumAnalysis entry per product that has "
        "extractable data. If a product has no meaningful discussion, include it with an "
        "empty verified_insights list."
    ))
    triage_human_message = HumanMessage(content=(
        f"Complete forum text corpus for [{products_list_str}]:\n\n{combined_corpus}"
    ))

    try:
        batch_analysis: SystemForumAnalysis = batch_llm.invoke(
            [triage_system_prompt, triage_human_message]
        )
    except Exception as exc:
        print(f"       ❌  Single-pass LLM triage failed: {exc}")
        return total_vaulted

    # ── Step 4: Vault each product's actionable insights with source_url ───────
    for model_analysis in batch_analysis.products_analysis:
        product    = model_analysis.product_name
        insights   = model_analysis.verified_insights
        product_id = _url_to_product_id(product)

        actionable = [
            ins for ins in insights
            if ins.classification in ("Constructive Criticism", "Legitimate Praise")
        ]
        noise_count = len(insights) - len(actionable)

        print(
            f"       📊  '{product}': {len(insights)} raw signals → "
            f"{len(actionable)} actionable, {noise_count} noise dropped"
        )

        if not actionable:
            continue

        doc_texts:     List[str]  = []
        doc_metadatas: List[dict] = []
        doc_ids:       List[str]  = []

        for idx, insight in enumerate(actionable):
            doc_text = (
                f"[{insight.classification}] "
                f"Severity: {insight.severity_weight}/5\n"
                f"Quote: {insight.raw_quote}\n"
                + (f"Issue: {insight.underlying_issue}" if insight.underlying_issue else "")
            ).strip()

            doc_texts.append(doc_text)
            doc_metadatas.append({
                "product_id":      product_id,
                "product_name":    product,
                "category":        category,
                "source_url":      insight.source_url or "unknown",
                "chunk_index":     idx,
                "chunk_type":      "forum_critique",
                "classification":  insight.classification,
                "severity_weight": insight.severity_weight,
            })
            doc_ids.append(f"{product_id}_forum_{idx}")

        with _vault_write_lock:
            vs.add_texts(texts=doc_texts, metadatas=doc_metadatas, ids=doc_ids)

        total_vaulted += len(doc_texts)
        print(f"       ✅  Vaulted {len(doc_texts)} forum critique documents for '{product}'")

    return total_vaulted


# ─── Phase 2.6: Devil's Advocate Consensus Node ───────────────────────────────

def devils_advocate_consensus_node(
    state: AgentState,
    query: str | None = None,
) -> Dict[str, Any]:
    """
    Adversarial RAG node — answers ONLY from verified community critique data.

    1. Retrieves ChromaDB chunks tagged chunk_type='forum_critique' via
       both metadata filter and semantic similarity.
    2. Builds a strict adversarial system prompt that forces the LLM to:
       - Cite the count of community discussions backing each flaw.
       - Never hallucinate beyond the retrieved critique data.
       - Lead with the most severe verified defects first.
    3. Returns an AIMessage grounded entirely in public forum complaints.
    """
    history = state.get("chat_history", [])
    user_query = query or ""
    if not user_query:
        for msg in reversed(history):
            if isinstance(msg, HumanMessage):
                user_query = msg.content
                break

    if not user_query:
        return {
            "chat_history": [
                AIMessage(content="👹 Devil's Advocate: Please ask me a question about the products.")
            ]
        }

    retrieved_products = state.get("retrieved_products", [])
    product_names = [p.get("name") for p in retrieved_products if p.get("name")]

    vs = _get_vectorstore()

    # ── Step 1: Metadata-filtered pull of all forum critique chunks ───────────
    critique_docs: List[Any] = []

    class _FakeDoc:
        def __init__(self, content: str, metadata: dict) -> None:
            self.page_content = content
            self.metadata     = metadata

    # Fetch all forum_critique chunks across every product
    for product_name in product_names:
        try:
            result = vs.get(
                where={
                    "$and": [
                        {"product_name": {"$eq": product_name}},
                        {"chunk_type":   {"$eq": "forum_critique"}},
                    ]
                }
            )
            if result and result.get("documents"):
                for doc_text, meta in zip(result["documents"], result["metadatas"]):
                    critique_docs.append(_FakeDoc(doc_text, meta))
        except Exception:
            pass

    # ── Step 2: Semantic similarity search over forum_critique space ──────────
    try:
        expanded_q = f"{user_query} " + " ".join(product_names)
        sim_docs = vs.similarity_search(expanded_q, k=ADVOCATE_TOP_K)
        # Keep only forum_critique hits from the similarity results
        sim_critique = [
            d for d in sim_docs
            if d.metadata.get("chunk_type") == "forum_critique"
        ]
    except Exception:
        sim_critique = []

    # ── Step 3: Merge — metadata pull first, then de-duplicated similarity hits
    seen_contents = {d.page_content for d in critique_docs}
    for d in sim_critique:
        if d.page_content not in seen_contents:
            critique_docs.append(d)
            seen_contents.add(d.page_content)

    if not critique_docs:
        no_data_msg = (
            "👹 **Devil's Advocate**: No verified community complaints found in the vault. "
            "Try running `/advocate` first to harvest forum data, or the products may have "
            "genuinely positive community sentiment."
        )
        return {"chat_history": [AIMessage(content=no_data_msg)]}

    # ── Step 4: Count discussion backing per product ───────────────────────────
    product_counts: Dict[str, int] = {}
    for d in critique_docs:
        pname = d.metadata.get("product_name", "Unknown")
        product_counts[pname] = product_counts.get(pname, 0) + 1

    total_discussions = len(critique_docs)

    # ── Step 5: Build context block (sorted by severity descending) ───────────
    sorted_docs = sorted(
        critique_docs,
        key=lambda d: d.metadata.get("severity_weight", 0),
        reverse=True,
    )

    context_parts = []
    for doc in sorted_docs:
        meta     = doc.metadata
        pname    = meta.get("product_name", "Unknown")
        severity = meta.get("severity_weight", "?")
        cls      = meta.get("classification", "")
        src_url  = meta.get("source_url", "Unknown")
        context_parts.append(
            f"Product: {pname} | Source: {src_url}\n"
            f"Severity: {severity}/5 | {cls}\n"
            f"{doc.page_content}"
        )
    context_block = "\n\n---\n\n".join(context_parts)

    # ── Step 6: Build adversarial system prompt ───────────────────────────────
    models_str = ", ".join(product_names) if product_names else "(all products)"
    coverage_summary = "  ".join(
        f"{name}: {count} signal(s)" for name, count in product_counts.items()
    )

    system_prompt = SystemMessage(content=(
        "You are a conversational, highly persuasive AI agent playing the Devil's Advocate. "
        "Your goal is to talk the user OUT of making a purchase by exposing verified real-world "
        "community bugs and flaws.\n\n"
        "DO NOT just output a dry, bulleted list of complaints. Converse with the user naturally. "
        "Weave the verified complaints into a flowing, narrative argument. Frame your sentences "
        "as if you are a concerned tech expert giving a friend an honest warning.\n\n"
        "CRITICAL NUMERICAL CITATION RULE: You must NEVER print the literal character "
        "letter 'N' inside the verification bracket. You must physically look at the "
        "matching context items provided below, count the exact number of independent "
        "threads or unique comment snippets backing that specific hardware defect, and "
        "output that real integer value. "
        "Example of correct format: '...and honestly, the thermal throttling is a "
        "dealbreaker. 🔴 [Sourced from 3 independent community reports - Severity Weight: 5/5] "
        "(reddit.com/r/Laptops). It essentially turns into a space heater...'. "
        "If an issue appears only once in the context data, output '1 independent community "
        "report'. The integer MUST reflect the actual count from the context — never a "
        "placeholder.\n\n"
        "SEVERITY FIRST: Lead your narrative with the highest-severity defects (Severity 4–5) "
        "and naturally flow down to lesser issues as the conversation continues.\n\n"
        "STRICT GROUNDING: Answer strictly using the provided context. Only discuss defects "
        "that appear in the retrieved context. Do NOT hallucinate or extrapolate beyond the data.\n\n"
        "NO HEDGING: Do not soften verified defects with marketing language or brand apologies. "
        "You are a concerned friend, not a PR spokesperson.\n\n"
        "PRODUCT SCOPE: Only discuss the products listed below. Do NOT introduce other models.\n\n"
        "ZERO DATA POLICY: If no complaints exist for a specific inquiry, converse naturally "
        "to state that the community hasn't reported issues regarding that yet — do not "
        "hallucinate data points.\n\n"
        f"Products under review: {models_str}\n"
        f"Total verified community signals in vault: {total_discussions}\n"
        f"Coverage per product: {coverage_summary}"
    ))

    context_message = HumanMessage(content=(
        f"[FORUM CRITIQUE VAULT — {total_discussions} verified signals]\n\n"
        f"{context_block}\n\n"
        f"[USER QUESTION]\n{user_query}"
    ))

    # Include recent chat history for follow-up context
    recent_history = []
    if history:
        history_to_consider = history[:-1] if len(history) > 0 else history
        recent_history = history_to_consider[-4:]

    messages = [system_prompt] + recent_history + [context_message]

    response = _get_llm_base().invoke(messages)
    answer_text = _extract_text_from_content(response.content)

    return {
        "chat_history": [AIMessage(content=answer_text)],
    }
