# Development Tracker: Product Recommendation Agent

This document tracks all changes, decisions, and progress made during the development of the codebase.

---

## Phase 1: CLI Prototype & LangGraph State Machine
**Status:** Completed
**Date:** July 2, 2026

### 🎯 Goal
Build the foundational "brain" of the agent using LangGraph and Gemini 1.5 Flash. The agent conducts a CLI-based interactive interview to extract product constraints into a structured format before triggering a mock search.

### 📝 Files Created & Changed
*   `requirements.txt`: Added core free-tier dependencies (`langchain`, `langgraph`, `langchain-google-genai`, `pydantic`, `python-dotenv`, `langsmith`).
*   `.env.example`: Created a template for `GEMINI_API_KEY` and optional LangSmith tracing variables.
*   `.gitignore`: Configured to ignore environment files, Python caches, and IDE metadata.
*   `agent/__init__.py`: Initialized the `agent` directory as a Python package.
*   `agent/state.py`: Defined the `AgentState` TypedDict to manage the conversation state, including `session_id`, `chat_history` (using the `add_messages` reducer), `constraints`, and the `is_profile_complete` routing flag.
*   `agent/models.py`: Created the `ProductConstraints` Pydantic v2 model (with 11 fields like category, budget, primary use case) to strictly structure the extracted preferences. Added helper methods `filled_fields()` and `missing_fields()`.
*   `agent/nodes.py`: Implemented the core logic nodes:
    *   `analyzer_node`: Uses Gemini with structured output to extract constraints, merges them with existing state, and checks if the profile is complete (threshold: 3 populated fields).
    *   `question_generator_node`: Asks targeted, conversational follow-up questions with multiple-choice options if the profile is incomplete.
    *   `search_orchestrator_mock_node`: Acts as a Phase 1 terminal placeholder; prints the finalized profile formatted nicely.
*   `agent/graph.py`: Wired the LangGraph `StateGraph` with conditional routing based on the `is_profile_complete` flag.
*   `main.py`: Created the main CLI entry point. Features a persistent `while True:` conversation loop, API key guards, ANSI-colored terminal output, and a specific fix (`sys.stdout.reconfigure`) for Windows cp1252 encoding to ensure emojis render correctly in PowerShell.
*   `README.md`: Wrote comprehensive setup instructions, architecture overview, and an example conversation session.

### 🧠 Technical Decisions & Notes
*   **Zero-Cost Infrastructure**: Exclusively used free open-source tools and Gemini via Google AI Studio (avoiding paid OpenAI/Anthropic APIs).
*   **State Management**: Chose LangGraph to handle the cyclic flow between the analyzer and the question generator. The `add_messages` reducer ensures conversation history is safely appended, not overwritten.
*   **Structured Outputs**: Enforced the LLM to output Pydantic-validated JSON for robust and predictable constraint extraction.
*   **Constraint Merging**: Designed the analyzer to layer new extractions on top of existing ones, ensuring previously gathered data is never lost across conversation turns.
*   **LLM Configuration**: Used `temperature=0` for the analyzer for deterministic extraction, and `temperature=0.4` for the question generator for a more natural conversational tone.
*   **Target Audience Adaptation**: Updated the extraction prompts and summary output to use Indian Rupees (INR) instead of USD to align with the primary user base. Added a strict rule to the `question_generator_node` to always format generated options in INR (₹) instead of Dollars ($).
*   **Refined Agent Strictness**: Increased `COMPLETION_THRESHOLD` from 3 to 5. Updated system prompts to strictly forbid auto-inferring soft requirements (like "good camera") based on professions, forcing the agent to actively ask clarifying questions.

---

## Phase 2: Tooling, Web Search & Persistent Product Intelligence Vault
**Status:** Completed
**Date:** July 3, 2026

### 🎯 Goal
Build the data acquisition and local RAG layer. Implement a persistent local vector store (Product Intelligence Vault) to scrape, index, and query product data matching the user's completed profile using 100% free local embeddings and cloud search APIs.

### 📝 Files Created & Changed
*   `requirements.txt`: Added Phase 2 dependencies (`tavily-python`, `chromadb`, `sentence-transformers`, `langchain-huggingface`, `langchain-chroma`, `langchain-community`, `beautifulsoup4`, `requests`). Later removed `tf-keras` due to protobuf conflicts.
*   `.env.example`: Added `TAVILY_API_KEY` placeholder.
*   `.env`: Added `TAVILY_API_KEY`, `TF_ENABLE_ONEDNN_OPTS=0`, and `TRANSFORMERS_NO_TF=1` to fix Keras 3 / TensorFlow import conflicts.
*   `agent/state.py`: Added `retrieved_products` (list of dicts) and `is_rag_mode` (boolean routing flag).
*   `agent/nodes.py`:
    *   Replaced `search_orchestrator_mock_node` with `search_and_vault_node` which uses Tavily to search the web, and ChromaDB/`all-MiniLM-L6-v2` to chunk and ingest web content into a persistent disk-backed vector vault (`./data/chroma_vault`).
    *   Added `comparison_agent_node`: A grounded LLM answering node that queries the local ChromaDB vault and strictly prevents hallucination. Added environment variable guards at the top to prevent TensorFlow imports.
*   `agent/graph.py`: Modified the conditional routing so that `is_profile_complete=True` routes to `search_and_vault_node`. RAG comparison routing is handled outside the graph to avoid constraint extraction on comparison queries.
*   `main.py`: Refactored to include a dual-loop architecture. The first loop runs the LangGraph interview. Once `is_rag_mode` becomes `True`, the script enters a dedicated "RAG Chat Loop" that directly dispatches user questions to `comparison_agent_node`. Added environment variable guards.

### 🧠 Technical Decisions & Notes
*   **Zero-Cost Local RAG**: Used `HuggingFaceEmbeddings` with `all-MiniLM-L6-v2` running entirely locally, coupled with disk-backed ChromaDB to maintain zero cloud infrastructure cost.
*   **Tavily Search Optimization**: Utilized Tavily Search API specifically because it provides clean Markdown/text extraction optimized for LLMs. Added a fallback to `requests` + `BeautifulSoup` if extraction fails.
*   **Idempotent Vault Ingestion**: Hashed product URLs to create stable `product_id`s, ensuring that if a user searches for the same product later, it results in an instant vault hit rather than duplicating chunks.
*   **RAG Architecture Dispatch**: Deliberately kept the RAG querying (`comparison_agent_node`) outside of the main LangGraph flow to prevent the analyzer node from incorrectly extracting "constraints" from user queries like "Compare their battery life".
*   **Strict Hallucination Prevention**: Enforced a strict system prompt in the RAG node: *"Answer ONLY using the provided context... If missing, explicitly state 'Information not available in the crawled data.'"*
*   **Dependency Conflict Resolution**: Encountered a `protobuf` upgrade conflict between `tf-keras` (needed by `transformers` for Keras 3 compatibility) and `google-ai-generativelanguage`. Resolved by uninstalling `tf-keras`/`tensorflow`, enforcing `protobuf==5.29.5`, and setting `TRANSFORMERS_NO_TF=1` to bypass the Keras check entirely.

---

## Phase 2 Optimization: Precision Search, Localization & UI Refinement
**Status:** Completed
**Date:** July 3, 2026

### 🎯 Goal
Upgrade the quality of search generation, localize all data context for Indian consumers, and polish the console UI — without adding any new dependencies.

### 📝 Files Changed
*   `agent/nodes.py`:
    *   **Dynamic Timestamp Injection**: Imported Python's `datetime` module. The `search_and_vault_node` now reads the live calendar month and year at runtime (e.g., "July 2026") and injects this into the LLM's search query generation prompt, preventing the model from defaulting to its training cutoff year.
    *   **LLM-Driven Search Query Generation**: Replaced the manual string-concatenation query builder with a dedicated LLM call (`_get_llm_base()`). The LLM is now given a structured system prompt with India-centric sourcing instructions and a manual fallback for resilience if the LLM call fails.
    *   **India-Centric Sourcing Prompt**: The search query system prompt now explicitly instructs the LLM to bias query phrasing toward premium tech platforms — YouTube (creator transcripts), GSMArena (hardware specs), Gadgets360/Smartprix/91mobiles (Indian retail & pricing), and The Verge/Wired/PCMag/CNET (editorial benchmarks). The open crawl perimeter is preserved; no `include_domains` filter is applied.
    *   **Post-Search Model Extraction**: Added a second lightweight LLM call immediately after the Tavily search returns. This call scans all raw snippets and extracts only the specific, concrete hardware model names explicitly mentioned (e.g., "Logitech MX Keys Mini, Keychron K6"). The clean extracted list is committed to `retrieved_products` state instead of raw webpage titles.
    *   The `overview` message in `search_and_vault_node` now uses `**📱 Extracted Models:**` as the section header.
*   `main.py`:
    *   Updated the RAG chat mode product listing header from `"Indexed products:"` to `"📱 Extracted Models:"` to match the cleaner, LLM-curated output.

### 🧠 Technical Decisions & Notes
*   **No `include_domains` Restriction**: Explicitly avoided Tavily's `include_domains` block. Hard domain restrictions risk cutting off emerging Indian tech blogs and forum discussions. Instead, organic keyword framing biases search ranking without locking out useful sources.
*   **Two-Pass LLM Pipeline**: The `search_and_vault_node` now runs two sequential LLM calls — one for query generation and one for model extraction — both using `_get_llm_base()` (temperature=0) for determinism. Both are wrapped in `try/except` with graceful fallbacks so a failed extraction never crashes the vault ingestion.
*   **Canonical Product State**: Introduced `canonical_products` — a distinct list built from the extracted model names — which replaces the raw URL-title list in the `retrieved_products` state field. If extraction fails, the node gracefully degrades to the original title-based list.
*   **Verification**: Confirmed via import check that `datetime.now().strftime('%B %Y')` correctly resolves to `"July 2026"` at runtime.

---

## Phase 3: Advanced Harvesting Architecture & Parallelism
**Status:** Completed
**Date:** July 7, 2026

### 🎯 Goal
Overhaul the Stage 2 specification harvesting logic to guarantee comprehensive spec coverage across all product categories without hardcoded assumptions, while drastically reducing processing time via multi-threading. Optimize RAG retrieval for comparison queries.

### 📝 Files Changed
*   `agent/nodes.py`:
    *   **Four-Layer Harvesting Architecture:**
        *   **Layer 1 (Category-Aware Query Generation):** Added `_generate_harvest_queries` to generate 4-5 targeted search query templates per product (covering performance, display, pricing, reviews, etc.).
        *   **Layer 2 (Multi-Query Execution):** Instantiates templates per model and deduplicates URLs across Tavily searches.
        *   **Layer 3 (Adaptive Chunking & Synthesis):**
            *   Added `_detect_content_type` to switch text splitting strategies based on content density (`spec_dense` vs `narrative`).
            *   Added `_synthesise_spec_card` to generate a structured Markdown specification table from the accumulated page texts using an LLM.
        *   **Layer 4 (Coverage Verification):** Checks chunk counts per model and runs a supplementary search if a model has fewer than 20 chunks.
    *   **Parallelism (Problem 1 Fix):**
        *   Replaced sequential per-model loop with a `ThreadPoolExecutor` processing 2 models concurrently.
        *   Extracted URL fetching into a standalone `_fetch_and_ingest_url` function, called by a 4-worker thread pool per model.
        *   Introduced `_vault_write_lock` (`threading.Lock()`) to explicitly guard all ChromaDB `vs.add_texts` calls against concurrent writes.
    *   **RAG Retrieval Optimization (Problem 2 Fix):**
        *   Replaced the bottleneck of 54 sequential CPU similarity searches in `comparison_agent_node`.
        *   Implemented a hybrid "spec-card-first" strategy: fetches the pre-synthesised spec cards using a fast metadata lookup, supplemented by a single targeted similarity search for context.
        *   Removed `_generate_spec_dimensions` call from the comparison node.

### 🧠 Technical Decisions & Notes
*   **Thread Safety:** ChromaDB reads are thread-safe, but writes require explicit locking to avoid race conditions. A global `_vault_write_lock` guarantees safe multi-threaded ingestion.
*   **Spec Card Pre-computation:** Moving specification structuring to the ingestion phase (`_synthesise_spec_card`) avoids repetitive and expensive inference during user queries, fundamentally resolving comparison latency.
*   **Adaptive Chunking:** Preserving row-level integrity for spec-dense tables required smaller chunks (`chunk_size=400`), while narrative content (reviews) functions better with larger chunks (`chunk_size=1000`).

---

## Phase 2.5: Performance & Reliability Patch
**Status:** Completed
**Date:** July 7, 2026

### 🎯 Goal
Resolve pipeline delays, Gemini API rate-limiting exhaustion (Requests Per Minute limits), and conversational memory limits when conducting comparison follow-up queries.

### 📝 Files Changed
*   `agent/nodes.py`:
    *   **Hyper-Concurrency (Query & Model Harvesting):**
        *   Updated `search_and_vault_node` to execute all discovered models concurrently via `ThreadPoolExecutor(max_workers=max(1, len(discovered_models)))`.
        *   Updated `_harvest_single_model` to run Tavily searches in parallel via `ThreadPoolExecutor(max_workers=4)`, removing sequential query delays and `time.sleep(0.2)`.
    *   **Bulk Spec Synthesis:**
        *   Removed individual `_synthesise_spec_card` LLM calls inside model harvesting threads.
        *   Added `_batch_synthesise_spec_cards` helper to merge raw page text corpora for all models and request a JSON mapping product names to Markdown tables in a single LLM call.
        *   Iterate and vault spec cards inside `search_and_vault_node` after all models have finished harvesting.
    *   **RAG Conversational Memory:**
        *   Updated `comparison_agent_node` to extract recent conversational history (up to 4 messages) and inject it into the LLM context, enabling memory across follow-ups and avoiding rate-limit hangs.

### 🧠 Technical Decisions & Notes
*   **Reduced LLM Call Overhead:** Reduced Stage 2 LLM calls from $N$ (one per model) down to exactly 1 batch call, significantly saving Gemini Free Tier Requests Per Minute (RPM).
*   **Conversational Memory Injection:** Cleanly inserts recent `HumanMessage`/`AIMessage` context between the system prompt and the current prompt inside the RAG loop to keep responses context-aware without triggering constraint extraction.

---

## Phase 2.6: Devil's Advocate Mode (Public Consensus Decoder) & Engine Performance Optimization
**Status:** Completed
**Date:** July 8, 2026

### 🎯 Goal
Add adversarial review capability (`/advocate` command) to scrape, triage, and expose public forum complaints using the Apify API and structured LLM classification. Concurrently optimize RAG comparison latency and search-stage specification card generation times to under 15 seconds.

### 📝 Files Changed
*   `requirements.txt`: Added `apify-client>=1.7.0` for Apify SDK integration.
*   `.env.example`: Added `APIFY_API_TOKEN` placeholders.
*   `agent/state.py`: Extended `AgentState` with the `is_advocate_mode: bool` routing flag.
*   `agent/nodes.py`:
    *   **Pydantic schemas:** Added `ForumInsight` and `ModelForumAnalysis` to parse, filter, and structure public reviews.
    *   **Dual Data Harvester:** Implemented `_harvest_and_triage_forum_data()` to query Reddit via Apify's `trudax/reddit-scraper` actor and Tavily in parallel. Splitted merged results into 500-character chunks and batch-triaged them via an LLM. Actionable insights are vaulted into ChromaDB under `chunk_type="forum_critique"`.
    *   **Adversarial Consensus Node:** Added `devils_advocate_consensus_node()` to retrieve `forum_critique` chunks, sort by complaint severity, and respond with verification badging (e.g. "🔴 Backed by N separate discussions").
    *   **Parallel Synthesis Engine (Stage 2 speedup):** Replaced the serial bulk `_batch_synthesise_spec_cards` call (which was sending a single 72KB+ context block) with `_parallel_synthesise_spec_cards` executing concurrent tasks inside a `ThreadPoolExecutor` worker pool. Dispatched spec sheet generation concurrently, lowering Stage 2 wait times from ~2 minutes down to 10-15 seconds.
    *   **Gemini Latency Optimization (RAG speedup):** Disabled dynamic thinking for Gemini 2.5 Flash (`thinking_budget=0`) in LLM instantiation singletons, fixing a critical issue where the model would hang for 4+ minutes trying to allocate dynamic compute over large comparison contexts.
*   `main.py`:
    *   Wired intercept support for `/advocate` and `/exit` commands in the RAG loop.
    *   Initialized `is_advocate_mode = False` state field.
    *   Rendered a custom dark-themed console banner (`ADVOCATE_BANNER`) upon activation and routed queries to `devils_advocate_consensus_node`.

### 🧠 Technical Decisions & Notes
*   **Structured Sarcasm & Bias Filtering:** Prompts filter out meme noise, unsubstantiated hate comments, and brand-bashing. True hardware/software complaints masked in hyperbole or sarcasm are preserved, normalized, and severity-weighted (1-5).
*   **Idempotency & Cache Hit Protection:** Before fetching from Apify/Tavily, the dual harvester queries ChromaDB to see if any `forum_critique` chunks already exist for the active product set, enabling instant cache recovery when toggle-switching mode.
*   **Zero-Overhead Spec Retrieval:** Maintained standard RAG separation by keeping critique data completely isolated via the `chunk_type` metadata filter. Standard RAG mode remains lightning-fast and untainted by critique snippets.
*   **Dynamic Thinking Impact:** Disabling Gemini's dynamic thinking budget reduced RAG response times to 5-15 seconds, proving that speculative reasoning layers on large context comparison inputs can severely degrade interactive CLI responsiveness.

---

## Phase 2.65: Zero-Auth Public Reddit Engine & Unified Array LLM Triage Pass
**Status:** Completed
**Date:** July 9, 2026

### 🎯 Goal
Resolve Apify trial paywalls, high network latency from crawling loops, and immediate Gemini Free Tier `429 RESOURCE_EXHAUSTED` rate limits from parallel structured LLM calls.

### 📝 Files Changed
*   `agent/nodes.py`:
    *   **Removed** Apify Client dependencies and lazy singletons.
    *   **Pydantic Schema:** Introduced `SystemForumAnalysis` as a master batch wrapper to aggregate multiple `ModelForumAnalysis` objects in a single pass.
    *   **Zero-Auth Reddit Engine:** Implemented `_fetch_reddit_json()` utilizing Reddit's unauthenticated search JSON endpoint with a custom User-Agent to retrieve post titles and body excerpts.
    *   **Unified Triage harvesters:** Updated `_harvest_and_triage_forum_data()` to combine all product feedback texts into a single buffer and pass them to the structured output LLM exactly once.
*   `main.py`:
    *   Updated status outputs to reflect pulling zero-auth Reddit JSON threads and structured batch evaluation.

---

## Phase 2.7: Legacy HTML Scraping (old.reddit.com)
**Status:** Completed
**Date:** July 9, 2026

### 🎯 Goal
Bypass Reddit's `403 Forbidden` API restrictions on search JSON calls by crawling `old.reddit.com/search` directly.

### 📝 Files Changed
*   `agent/nodes.py`:
    *   **HTML Scraper:** Implemented `_fetch_reddit_html()` to query `old.reddit.com/search`, parse results with BeautifulSoup, extracting post titles from `div.search-result-listing -> a.search-title` and body segments, and graceful fallbacks.

---

## Phase 2.75: Single-Request Tavily Engine & Metadata URLs
**Status:** Completed
**Date:** July 9, 2026

### 🎯 Goal
Eliminate brittle scraping of Reddit and legacy HTML pages entirely. Implement a robust, single-request Tavily query architecture for each product, keeping the single-pass Gemini batching active for 429 protection, while maintaining precise metadata source URLs.

### 📝 Files Changed
*   `requirements.txt`: Removed `apify-client` dependency.
*   `agent/nodes.py`:
    *   **Removed** `_fetch_reddit_html` and Reddit-specific crawling methods.
    *   **Pydantic Schema Upgrade:** Added the `source_url` field to `ForumInsight` so the LLM extracts the exact origin of each complaint.
    *   **Tavily Engine Rewrite:** Rebuilt `_harvest_and_triage_forum_data()` to run exactly one advanced natural language search query per product (`"what are all the problems faced by the users of {model} on reddit"`) with `max_results=6` and `search_depth="advanced"`.
    *   **Metadata Stamping:** Stamped source URLs above texts using `--- SOURCE URL: <url> ---` tags in the combined corpus. The single structured LLM pass extracts and associates these URLs, which are stored in the vector database.
    *   **Consensus Node Upgrade:** Modified `devils_advocate_consensus_node` to format context to expose URLs, and instructs the system prompt to append the source URL/domain in parentheses at the end of each bullet point.
*   `main.py`:
    *   Cleaned status strings to show:
        *   `📡 Executing strict single-request Tavily queries for community feedback...`
        *   `🧠 Analyzing text batch via single structured pass (Gemini Rate Guard Engaged)...`

### 🧠 Technical Decisions & Notes
*   **Low Maintenance:** Removing custom scrapers avoids breakage from future Reddit changes.
*   **Source Traceability:** Propagating the `source_url` all the way from search to ChromaDB to the final RAG output guarantees the adversarial bullets remain auditable and grounded.

