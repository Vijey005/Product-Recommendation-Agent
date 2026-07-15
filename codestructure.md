# Code Structure: Product Recommendation Agent

This document explains the architecture, file organization, and core modules of the Product Recommendation Agent codebase. It serves as a comprehensive reference guide for developers and AI assistants to understand how the system is put together.

---

## File Directory Map

Here is the complete layout of the workspace. Click any file link to open it:

- [main.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/main.py) — The CLI entry point and execution loop orchestrator.
- [agent/](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent) — Core agent package folder.
  - [agent/__init__.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/__init__.py) — Packages initializer.
  - [agent/state.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/state.py) — State definitions and schemas sharing data across components.
  - [agent/models.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/models.py) — Pydantic structures for user constraint parsing.
  - [agent/graph.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/graph.py) — LangGraph state machine topology and wiring.
  - [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py) — Graph execution nodes, scraping utilities, RAG agent, and forum triagers.
- [requirements.txt](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/requirements.txt) — Project dependencies (LangChain, LangGraph, Tavily, ChromaDB, Sentence Transformers).
- [.env](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/.env) — Active environment configurations (contains API keys).
- [.env.example](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/.env.example) — Template configuration file.
- [README.md](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/README.md) — Standard user manual and setup guidelines.
- [Product Recommendation Agent PRD.pdf](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/Product%20Recommendation%20Agent%20PRD.pdf) — Original product requirements document.
- [Production-Ready Product Recommendation PRD.pdf](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/Production-Ready%20Product%20Recommendation%20PRD.pdf) — Detailed specifications for advanced implementation.

---

## Architecture Overview

The system is designed as a **two-phase interactive assistant**:

1. **Phase A (Interview Loop):** Built as a cyclic state machine in **LangGraph**. The system asks targeted questions to understand product criteria. An analyzer node reads the history to extract criteria into a structured Pydantic schema. Once at least 5 attributes are filled, Phase A terminates by launching a concurrent product discovery and crawling engine (the Spec Harvester).
2. **Phase B (RAG Chat Loop):** Directly managed by [main.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/main.py) to save LLM tokens and ensure high responsiveness. The user enters a standard chat mode. Queries are dispatched to retrieval nodes querying a local vector store ([ChromaDB](https://github.com/chroma-core/chroma)) indexed with the crawls. 
   - *Standard RAG Mode:* Compares specifications from pre-computed spec tables.
   - *Devil's Advocate Mode (triggered via `/advocate`):* Swaps context entirely to community complaints sourced from Reddit/public forums to highlight defects and bugs.

---

## File Responsibilities & Key Symbols

### 1. [main.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/main.py)
- **Role:** Handles the command-line interface, handles inputs, prints colored terminal banners, and manages the execution loop transition.
- **Key Flow:**
  - Performs environment checks on start, ensuring `GEMINI_API_KEY` and `TAVILY_API_KEY` are present.
  - Reconfigures stdout to UTF-8 on Windows command lines for proper emoji rendering.
  - Runs a dual-loop:
    - **Loop 1:** Invokes the compiled LangGraph application `app.invoke(state)` on every user turn until the graph signals `is_rag_mode = True`.
    - **Loop 2:** Breaks out of LangGraph, prints a list of discovered products, and routes inputs straight to [comparison_agent_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1343) or [devils_advocate_consensus_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1742).
    - Captures `/advocate` to engage advocate mode and `/exit` to return to spec comparison mode.

### 2. [agent/state.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/state.py)
- **Role:** Declares the single source of truth dict that flows through the system.
- **Key Symbols:**
  - [AgentState](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/state.py#L17) (`TypedDict`): Holds execution variables:
    - `session_id`: Unique session string.
    - `chat_history`: Running message log using the LangGraph `add_messages` reducer to safely append turns.
    - `constraints`: Dictionary of criteria extracted by the LLM.
    - `is_profile_complete`: Boolean flag triggering transition to the harvester.
    - `retrieved_products`: Curated list of specific models found on the web (populated by the discovery pipeline).
    - `is_rag_mode`: State flag routing queries straight to Phase B.
    - `is_advocate_mode`: State flag indicating if RAG queries target public complaints instead of technical specs.

### 3. [agent/models.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/models.py)
- **Role:** Pydantic validation structure for user requirements.
- **Key Symbols:**
  - [ProductConstraints](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/models.py#L16) (`BaseModel`): 11 critical properties describing the buyer's desired device:
    - `product_category`, `budget_min`, `budget_max`, `primary_use_case`, `hard_requirements`, `preferred_brands`, `avoided_brands`, `form_factor`, `operating_system`, `performance_tier`, and `additional_notes`.
    - Provides helper methods `filled_fields()` and `missing_fields()` to monitor profiling completion progress.

### 4. [agent/graph.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/graph.py)
- **Role:** Constructs and compiles the LangGraph StateGraph topology.
- **Key Symbols:**
  - [build_graph()](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/graph.py#L57): Hooks up the graph structure:
    - Sets [analyzer_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L333) as entry point.
    - Adds conditional edge using `_route_after_analysis()` routing to [question_generator_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L380) (if profile is incomplete) or [search_and_vault_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L951) (if complete).
    - Exposes the runnable compiled instance as `app`.

### 5. [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py)
- **Role:** Exposes graph nodes, search drivers, LLM triagers, and vector DB vault interfaces.
- **Pydantic Schemas for Forum Triaging:**
  - [ForumInsight](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L94): Stores structured complaint data containing `raw_quote`, `classification` (Constructive Criticism, Legitimate Praise, Unsubstantiated Hate, Meme Noise), `underlying_issue`, `severity_weight` (1 to 5), and `source_url`.
  - [ModelForumAnalysis](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L131): Collection of verified insights per device model.
  - [SystemForumAnalysis](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L141): Master batch payload wrapper.
- **Key Nodes & Engines:**
  - [analyzer_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L333): Uses structured LLM extraction to populate [ProductConstraints](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/models.py#L16). Prevents soft-inference assumptions (e.g. assuming "good camera" for creators) to enforce precise profiling.
  - [question_generator_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L380): Identifies missing criteria and drafts the single next best question. Formats currency outputs in INR (`₹`) and supplies 3-4 numbered options for user simplicity.
  - [search_and_vault_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L951): Runs the four-layer specification harvesting engine:
    - **Stage 1 (Discovery):** Generates a time-aware discovery search query using the live month/year. Curates exactly 5-6 model names from snippet results via a dedicated curator LLM call.
    - **Stage 2 (Spec Harvester):**
      - *Layer 1:* LLM generates query templates targeting specific spec clusters (performance, screens, reviews, battery).
      - *Layer 2 (Multi-Query Execution):* Deduplicates URLs and runs Tavily search templates concurrently per model using a ThreadPoolExecutor.
      - *Layer 3 (Adaptive Ingestion & Spec Synthesis):* Fetches content using Tavily extraction or BeautifulSoup fallbacks. Dynamically checks content type: parses spec-dense tables with smaller chunking bounds (`chunk_size=400`) and narrative critiques with larger bounds (`chunk_size=1000`). Synthesizes complete specification sheets in parallel using `_parallel_synthesise_spec_cards` executing concurrent LLM calls per model. Chunks and specification cards are vaulted into ChromaDB. Writes are explicitly thread-guarded using `_vault_write_lock`.
      - *Layer 4 (Coverage Verification):* Assesses total chunks vaulted. Triggers supplementary crawls for any device with fewer than 20 chunks.
  - [comparison_agent_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1412): A grounded RAG answer node. Implements a hybrid spec-card-first retrieval mechanism: retrieves the pre-computed spec sheets using metadata filters (bypassing expensive embedding model CPU steps) and appends a single semantic search to resolve qualitative queries.
    - **Phase 2.98 Stability Fixes:**
      - *Semantic Query Isolation:* The similarity search is isolated to query the vector store using ONLY the raw, latest user query (`user_query`) instead of an expanded query containing all candidate names, keeping CPU embedding calculations minimal and preventing thread calculation hangs on the second turn.
      - *Eager Pre-warming:* Instantiates `HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")` eagerly at module initialization time rather than lazily. This completely absorbs the model loading cold start during the `Initialising AI models...` CLI startup phase.
      - *LLM Request Timeouts:* Configures the Gemini client with a rigid `request_timeout=20.0` option to force a socket drop at 20 seconds, preventing terminal hangs on rate-limited or blocked API endpoints.
      - *Prior-Turn Context Truncation:* Filters chat history to the last 4 turns and truncates each message text to a maximum of 2,000 characters. This aggressively strips large markdown comparison tables generated during previous turns to prevent context bloat and Gemini thinking-token hangs on subsequent turns.
  - [_harvest_and_triage_forum_data](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1609): Triggered by `/advocate`. Issues exactly **one** natural-language Tavily search per product targeted at Reddit user reports, stamping URL boundaries `--- SOURCE URL: <url> ---` into a master corpus buffer. Evaluates the full text buffer in **one single structured LLM pass** using [SystemForumAnalysis](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L142) to defend against Gemini Free Tier 429 rate limit issues. Stores triaged insights with source URLs into ChromaDB under `chunk_type="forum_critique"`.
  - [devils_advocate_consensus_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1810): Queries `forum_critique` vectors. Formats descriptions sorted by severity with discussion counts (`🔴 [Sourced from N independent community reports - Severity Weight: X/5]: ...`) and appends domain-level origin URLs in parentheses.

---

## Vector Store Schema Design

The Product Intelligence Vault is backed by local disk storage (`./data/chroma_vault`). Chunks use different metadata footprints depending on their role:

| Metadata Field | Type | Description / Usage |
| :--- | :--- | :--- |
| `product_id` | `str` | MD5 hash of source URL (spec files) or product name (critiques). Enables cache evaluation. |
| `product_name` | `str` | Canonical product name (e.g. `"Keychron K6"`). |
| `category` | `str` | Product classification category. |
| `source_url` | `str` | Original crawler URL or `"synthesised_spec_card"` for structural sheets. |
| `chunk_type` | `str` | Routes retrieval: `"spec_dense"`, `"narrative"`, `"spec_card"` (structured spec tables), or `"forum_critique"` (Reddit/forum complaints). |
| `classification` | `str` | *Only on critiques.* Insight type (e.g. `"Constructive Criticism"`). |
| `severity_weight`| `int` | *Only on critiques.* Issue rating (1 to 5). |
