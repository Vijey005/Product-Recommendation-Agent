# Code Structure: Product Recommendation Agent

This document explains the architecture, file organization, and core modules of the Product Recommendation Agent codebase. It serves as a comprehensive reference guide for developers and AI assistants to understand how the system is put together.

---

## File Directory Map

Here is the complete layout of the workspace. Click any file link to open it:

- [main.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/main.py) — Legacy CLI entry point and execution loop orchestrator (retained for local testing).
- [agent/](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent) — Core agent package.
  - [agent/__init__.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/__init__.py) — Package initializer.
  - [agent/state.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/state.py) — `AgentState` TypedDict: single source of truth shared across all nodes and API sessions.
  - [agent/models.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/models.py) — `ProductConstraints` Pydantic model for structured user requirement parsing.
  - [agent/graph.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/graph.py) — LangGraph `StateGraph` topology and conditional routing.
  - [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py) — All graph nodes, spec harvesting engine, RAG answering nodes, and forum triager.
- [api/](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/api) — **Phase 3.0** production FastAPI backend package.
  - [api/__init__.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/api/__init__.py) — Package marker.
  - [api/server.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/api/server.py) — FastAPI app factory: CORS, slowapi rate-limiting middleware, lifespan startup hook, global exception handler.
  - [api/routes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/api/routes.py) — All HTTP endpoints, Pydantic I/O schemas, SSE frame helpers, and async streaming generators.
  - [api/dependencies.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/api/dependencies.py) — Module-level singletons: embedding warm-up, MemorySaver graph, SessionStore, and FastAPI `Depends` factories.
- [advisor-ui/](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/advisor-ui) — Next.js 16 (Turbopack) web interface using Tailwind CSS and Framer Motion.
- [requirements.txt](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/requirements.txt) — All dependencies: LangChain, LangGraph, Tavily, ChromaDB, Sentence Transformers, FastAPI, uvicorn, sse-starlette, slowapi.
- [fix_surrogates.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/fix_surrogates.py) — UTF-8 surrogate pair fixer utility for agent output logs (retained as utility).
- [.env](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/.env) — Active environment configuration (API keys — gitignored).
- [.env.example](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/.env.example) — Template for required environment variables.
- [README.md](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/README.md) — Setup guide and usage instructions.
- [Product Recommendation Agent PRD.pdf](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/Product%20Recommendation%20Agent%20PRD.pdf) — Original product requirements document.
- [Production-Ready Product Recommendation PRD.pdf](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/Production-Ready%20Product%20Recommendation%20PRD.pdf) — Detailed specifications for the production implementation.

---

## Architecture Overview

The system now operates in two modes sharing the same underlying LangGraph agent and node logic:

### Mode 1 — Legacy CLI (`main.py`)
Direct Python execution. Runs the LangGraph interview loop then drops into a blocking RAG chat loop. Used for local testing.

### Mode 2 — Production API Server (`api/`)
FastAPI server exposing the agent over HTTP with **real-time token streaming via Server-Sent Events (SSE)**. Run with:
```
uvicorn api.server:app --reload --port 8000
```

### Agent Phases (shared by both modes)

1. **Phase A — Interview Loop:** A cyclic LangGraph state machine. The `analyzer_node` extracts structured criteria via LLM into `ProductConstraints`. Once ≥5 fields are populated (`is_profile_complete = True`), the graph transitions to `search_and_vault_node` which runs the four-layer spec harvesting engine.

2. **Phase B — RAG Chat:** User enters open-ended chat. Queries route to `comparison_agent_node` (spec comparisons, grounded in ChromaDB vault) or `devils_advocate_consensus_node` (adversarial forum critique).

3. **Phase 3.0 — API Streaming Layer:** The `api/` package wraps Phase A and B in async SSE generators. Every token the LLM produces is forwarded to the client immediately. Blocking I/O (ChromaDB, Tavily, `time.sleep` rate gaps) runs in `asyncio.to_thread()` to keep the FastAPI event loop unblocked.

---

## File Responsibilities & Key Symbols

### 1. [main.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/main.py)
- **Role:** Legacy CLI — environment checks, UTF-8 console guard (Windows), dual execution loop.
- **Key Flow:**
  - **Loop 1:** `app.invoke(state)` on every user turn until `is_rag_mode = True`.
  - **Loop 2:** Routes inputs to `comparison_agent_node` or `devils_advocate_consensus_node`. Intercepts `/advocate` and `/exit` commands.

### 2. [agent/state.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/state.py)
- **Role:** Declares the single `AgentState` TypedDict that flows through every node and every HTTP session.
- **Key Symbols:**
  - [AgentState](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/state.py#L17): `session_id`, `chat_history` (LangGraph `add_messages` reducer), `constraints`, `is_profile_complete`, `retrieved_products`, `is_rag_mode`, `is_advocate_mode`.

### 3. [agent/models.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/models.py)
- **Role:** Pydantic validation for user requirements.
- **Key Symbols:**
  - [ProductConstraints](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/models.py#L16): 11 fields — `product_category`, `budget_min`, `budget_max`, `primary_use_case`, `hard_requirements`, `preferred_brands`, `avoided_brands`, `form_factor`, `operating_system`, `performance_tier`, `additional_notes`. Helpers: `filled_fields()`, `missing_fields()`.

### 4. [agent/graph.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/graph.py)
- **Role:** Constructs and compiles the LangGraph `StateGraph`.
- **Key Symbols:**
  - [build_graph()](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/graph.py#L57): Wires `analyzer_node` → conditional edge (`_route_after_analysis`) → `question_generator_node` (incomplete) or `search_and_vault_node` (complete). Returns `app` compiled **without** a checkpointer (CLI use only).
  - The API server reconstructs an identical graph in `api/dependencies.py` compiled with `MemorySaver` for cross-request session persistence.

### 5. [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py)
- **Role:** All graph node functions, LLM clients, ChromaDB vault interface, web scrapers, and forum triager.
- **Pydantic Schemas for Forum Triaging:**
  - [ForumInsight](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L94): `raw_quote`, `classification`, `underlying_issue`, `severity_weight` (1–5), `source_url`.
  - [ModelForumAnalysis](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L131): Collection of `ForumInsight` per device.
  - [SystemForumAnalysis](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L141): Master batch wrapper for the single-pass LLM triage call.
- **Key Nodes & Engines:**
  - [_PROGRESS_CALLBACKS](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L62): Global dictionary mapping session IDs to live progress logging callbacks.
  - [register_progress_cb / unregister_progress_cb](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L65): Register and clean up event hooks for worker threads to push progress updates back to the event loop.
  - [analyzer_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L356): Structured LLM extraction into `ProductConstraints`. Strict anti-inference prompting prevents soft assumptions.
  - [question_generator_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L403): Identifies missing fields, drafts one targeted question with 3–4 numbered options. Budget in INR (`₹`).
  - [search_and_vault_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L977): Four-layer spec harvesting:
    - *Stage 1 (Discovery):* Time-stamped query (`datetime.now().strftime('%B %Y')`), curator LLM extracts 5–6 canonical model names. Sends real-time progress callbacks back to the API.
    - *Stage 2 — Layer 1:* LLM generates 4–5 query templates per spec cluster.
    - *Stage 2 — Layer 2:* ThreadPoolExecutor runs Tavily queries concurrently; URLs deduplicated.
    - *Stage 2 — Layer 3 (Adaptive Ingestion):* Tavily extract + BeautifulSoup fallback. `chunk_size=400` for spec-dense tables, `chunk_size=1000` for narrative. Spec cards synthesised **sequentially** with `time.sleep(3)` between each model call to clear Gemini Free Tier 429 burst limits. All writes thread-guarded by `_vault_write_lock`. Emits status updates for each model as it completes ingestion and synthesis.
    - *Stage 2 — Layer 4:* Coverage check — re-crawls any model with <20 vaulted chunks.
  - [comparison_agent_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1419): Hybrid spec-card-first RAG. Metadata filter pulls spec cards (no embedding computation); semantic `similarity_search` on the latest raw `user_query` only (Phase 2.98 isolation fix). History truncated to last 4 turns × 2,000 chars. LLM `request_timeout=20.0`.
  - [_harvest_and_triage_forum_data](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1636): One Tavily search per product (`search_depth="advanced"`, `max_results=6`), URL-stamped corpus, single structured LLM triage pass → ChromaDB `chunk_type="forum_critique"`. In the API this runs inside `asyncio.to_thread()`.
  - [devils_advocate_consensus_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1861): Queries `forum_critique` chunks, sorts by `severity_weight`, formats `🔴 [Sourced from N independent community reports - Severity Weight: X/5]` with source domain URLs.

---

### 6. [api/dependencies.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/api/dependencies.py)
- **Role:** Module-level singleton initialisation; FastAPI `Depends` factories.
- **Key Symbols:**
  - `_embeddings`: `HuggingFaceEmbeddings("sentence-transformers/all-MiniLM-L6-v2")` pre-warmed at import time. Registered with `nodes.py` via `configure_embeddings()` — zero duplicate model loads.
  - `_checkpointer` (`MemorySaver`): LangGraph in-process checkpoint store for cross-request interview persistence.
  - `app_with_memory`: `StateGraph` compiled with `_checkpointer`. Separate from `graph.app` (CLI, no checkpointer).
  - `SessionStore` (`Dict[str, Dict]`): `session_id → AgentState` mapping. Created on first `POST /api/v1/chat`.
  - `get_or_create_session(session_id)`: Returns existing or fresh `AgentState`-compatible dict.
  - `get_agent_app()`: `Depends` factory → `app_with_memory`.
  - `get_embeddings()`: `Depends` factory → `_embeddings`.

### 7. [api/routes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/api/routes.py)
- **Role:** All HTTP endpoints, Pydantic I/O schemas, SSE formatters, and async streaming generators.
- **Important:** `from __future__ import annotations` is intentionally **absent** — Pydantic v2 requires eager type evaluation; schemas are defined before `router = APIRouter()`.
- **Pydantic Schemas:**
  - `ChatRequest`: `session_id` + `message` (1–4,000 chars).
  - `AdvocateRequest`: `session_id` + `product_name` (1–200 chars).
  - `SessionStateResponse`: Read-only session snapshot, including serialized chat history response list.
- **SSE Helpers:** `_sse_token()`, `_sse_done()`, `_sse_error()`, `_sse_status()`, `_sse_progress()` — RFC 8895 `event:/data:` frame formatters for tokens, status, errors, and live progress ticks.
- **Streaming Generators:**
  - `_stream_interview_phase()`: Orchestrates parallel `run_graph` (evaluating LangGraph logic) and `run_progress` (draining `ProgressQueues` events) asyncio tasks, merging and forwarding them back to the client event source.
  - `_stream_rag_phase()`: ChromaDB retrieval in `asyncio.to_thread()`, rebuilds `comparison_agent_node` message chain, streams `llm.astream()` tokens.
  - `_stream_advocate_phase()`: `_harvest_and_triage_forum_data` in `asyncio.to_thread()`, retrieves forum critique chunks, streams adversarial LLM response.
- **Routes:**

| Method | Path | Rate Limit | Description |
|--------|------|-----------|-------------|
| `GET` | `/health` | — | Liveness probe |
| `GET` | `/api/v1/session/{session_id}` | — | `SessionStateResponse` snapshot |
| `POST` | `/api/v1/chat` | 20/min | SSE stream — interview or RAG phase |
| `POST` | `/api/v1/advocate` | 20/min | SSE stream — Devil's Advocate critique |

### 8. [api/server.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/api/server.py)
- **Role:** FastAPI application factory and middleware stack.
- **Key Configuration:**
  - `lifespan`: imports `api.dependencies` at startup (triggers embedding warm-up + graph compilation) and logs readiness banner.
  - `CORSMiddleware`: `allow_origins=["*"]` for local dev (lock down to specific origin in production).
  - `SlowAPIMiddleware` + `app.state.limiter`: `slowapi` 20 req/min per IP on chat/advocate routes — protects Gemini and Tavily free-tier quotas.
  - Global `Exception` handler: clean `{"detail": "..."}` JSON instead of 500 stack traces.

### 9. [advisor-ui/](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/advisor-ui)
- **Role:** Next.js 16 (Turbopack) React user interface leveraging Tailwind CSS and Framer Motion.
- **Key Components:**
  - [useSSE.ts](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/advisor-ui/src/hooks/useSSE.ts): Custom SSE hooks subscribing to token, status, done, error, and progress streams.
  - [advisorStore.ts](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/advisor-ui/src/store/advisorStore.ts): Zustand global store managing devil mode toggle, chat history persistence, and product list states.
  - [VaultBuildingAnimation.tsx](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/advisor-ui/src/components/search/VaultBuildingAnimation.tsx): Interactive overlay UI mapping live progress events to dynamic timeline steps.
  - [ProductCard.tsx](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/advisor-ui/src/components/vault/ProductCard.tsx): Grid card element rendering specifications, ratings, prices with safe fallbacks.
  - [page.tsx](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/advisor-ui/src/app/(advisor)/chat/%5BsessionId%5D/page.tsx): Main split layout orchestrator connecting messaging inputs and UI state steps.

---

## Vector Store Schema Design

The Product Intelligence Vault is backed by local disk storage (`./data/chroma_vault`). Chunks use different metadata footprints depending on their role:

| Metadata Field | Type | Description / Usage |
| :--- | :--- | :--- |
| `product_id` | `str` | MD5 hash of source URL (spec files) or product name (critiques). Enables idempotent cache checks. |
| `product_name` | `str` | Canonical product name (e.g. `"Keychron K6"`). |
| `category` | `str` | Product classification category. |
| `source_url` | `str` | Original crawler URL or `"synthesised_spec_card"` for LLM-generated spec tables. |
| `chunk_type` | `str` | Routes retrieval: `"spec_dense"`, `"narrative"`, `"spec_card"`, or `"forum_critique"`. |
| `classification` | `str` | *Critiques only.* Insight type (e.g. `"Constructive Criticism"`). |
| `severity_weight` | `int` | *Critiques only.* Issue severity rating 1–5. |
