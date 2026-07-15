# Development Tracker: Product Recommendation Agent

This document tracks all design decisions, file modifications, and progress milestones made during the development of the Product Recommendation Agent codebase.

---

## Workspace Quick Links

- [main.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/main.py)
- [agent/state.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/state.py)
- [agent/models.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/models.py)
- [agent/graph.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/graph.py)
- [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py)
- [requirements.txt](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/requirements.txt)
- [.env.example](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/.env.example)

---

## Phase 1: CLI Prototype & LangGraph State Machine
**Status:** Completed  
**Date:** July 2, 2026  

### 🎯 Goal
Build the foundational conversation "brain" using [LangGraph](https://github.com/langchain-ai/langgraph) and Gemini. The agent conducts an interactive interview to collect user requirements into a structured schema before executing a mock product discovery print.

### 📝 Files Created & Changed
- [requirements.txt](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/requirements.txt): Added core dependencies (`langchain`, `langgraph`, `langchain-google-genai`, `pydantic`, `python-dotenv`, `langsmith`).
- [.env.example](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/.env.example): Added API keys template for `GEMINI_API_KEY` and LangSmith tracing environment variables.
- [.gitignore](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/.gitignore): Configured to ignore environment files, Python `__pycache__` folders, local SQLite/Chroma directories, and developer IDE configs.
- [agent/__init__.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/__init__.py): Initialized the `agent` folder as a Python package.
- [agent/state.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/state.py): Created [AgentState](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/state.py#L17) TypedDict to manage variables such as `chat_history`, `constraints`, and `is_profile_complete`.
- [agent/models.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/models.py): Declared [ProductConstraints](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/models.py#L16) Pydantic model containing 11 validation fields, along with helpers `filled_fields()` and `missing_fields()`.
- [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py): Implemented:
  - [analyzer_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L333): Uses structured output to extract constraints.
  - [question_generator_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L380): Asks single target questions.
  - `search_orchestrator_mock_node`: Terminal mock node formatting the gathered constraints.
- [agent/graph.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/graph.py): Wired [build_graph()](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/graph.py#L57) with conditional edges routing based on profiling completion.
- [main.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/main.py): Structured interactive CLI run loops with Windows UTF-8 console output guards.
- [README.md](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/README.md): Created overview documentation and onboarding setup steps.

### 🧠 Technical Decisions & Notes
- **Zero-Cost Setup:** Relies exclusively on Gemini free-tier via Google AI Studio and free local model alternatives.
- **Incremental Preference Building:** Prompts layer new extractions on top of existing constraints to prevent resetting previously gathered criteria.
- **Strict Anti-Inference Routing:** Set `COMPLETION_THRESHOLD = 5`. System prompts strictly forbid the analyzer from making soft-inference assumptions (e.g. assuming "good camera" for designers) to force direct questioning for accuracy.
- **Indian Market Focus:** Configured prompts to conduct discussions and request budgets in Indian Rupees (INR, `₹`).

---

## Phase 2: Web Search Tooling & Persistent Product Vault
**Status:** Completed  
**Date:** July 3, 2026  

### 🎯 Goal
Implement the data acquisition and local retrieval-augmented generation (RAG) layers. Develop a persistent vector store to crawl, chunk, and index matching product reviews and data sheets.

### 📝 Files Created & Changed
- [requirements.txt](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/requirements.txt): Added RAG dependencies (`tavily-python`, `chromadb`, `sentence-transformers`, `langchain-huggingface`, `langchain-chroma`, `langchain-community`, `beautifulsoup4`, `requests`). Removed `tf-keras` due to package conflicts.
- [.env.example](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/.env.example): Added `TAVILY_API_KEY` placeholder.
- [agent/state.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/state.py): Added `retrieved_products` and `is_rag_mode` state variables.
- [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py):
  - Replaced the mock node with [search_and_vault_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L951) using Tavily searches and local ChromaDB to store web content.
  - Implemented [comparison_agent_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1343) for grounded query answering.
- [agent/graph.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/graph.py): Connected graph endings to route to [search_and_vault_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L951).
- [main.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/main.py): Created the dual-loop CLI. When `is_rag_mode = True`, the console breaks out of LangGraph execution, entering a RAG chat loop communicating directly with the answering nodes.

### 🧠 Technical Decisions & Notes
- **Zero-Cost Embedding Processing:** Used `sentence-transformers/all-MiniLM-L6-v2` running 100% locally on CPU to embed chunks for zero cloud operational costs.
- **Tavily Extract API:** Selected Tavily to retrieve parsed page text blocks. Wrote requests-based HTML fallback scraping routines as fallback guards.
- **Idempotency Hash Keys:** Configured crawler to hash page URLs into 12-char product IDs, checking ChromaDB prior to network crawls to prevent duplicated documents.
- **Conflict Resolution:** Deployed environment overrides `TRANSFORMERS_NO_TF = 1` and `TF_ENABLE_ONEDNN_OPTS = 0` to bypass conflicts between Keras 3 and Google Protobuf versions.

---

## Phase 2 Optimization: Precision Search, Sourcing & UI Refinement
**Status:** Completed  
**Date:** July 3, 2026  

### 🎯 Goal
Improve search relevancy for Indian consumers, inject live timing contexts into query prompts, and refine console outputs.

### 📝 Files Changed
- [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py):
  - **Dynamic Timestamps:** Injected Python's `datetime.now().strftime('%B %Y')` (e.g. "July 2026") into search prompts to prevent the LLM from relying on static training cutoff dates.
  - **Structured Sourcing Biasing:** Updated query generation prompts to focus results toward Indian tech portals (smartprix, gsmarena, gadgets360, 91mobiles, youtube transcripts). Avoided strict domain restrictions to keep the crawl perimeter open.
  - **Product Curator LLM:** Added a post-search curator LLM pass to scan result snippets and extract 5-6 canonical model names.
- [main.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/main.py): Adjusted CLI listing titles to display the curated list of models.

### 🧠 Technical Decisions & Notes
- **Canonical Model Names:** Instead of indexing pages by raw HTML titles, the system uses the LLM curator to extract distinct models (e.g., `"Logitech MX Keys Mini"`), updating state mapping variables cleanly.

---

## Phase 3: Advanced Spec Harvesting & Concurrency
**Status:** Completed  
**Date:** July 7, 2026  

### 🎯 Goal
Guarantee thorough spec coverage across categories without hardcoding domain structures, while reducing network waiting bottlenecks.

### 📝 Files Changed
- [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py):
  - **Four-Layer Harvester:**
    - *Layer 1:* Generates 4-5 templates targeting unique spec clusters (screens, performance, price, reviews).
    - *Layer 2:* Executes queries concurrently and deduplicates URLs.
    - *Layer 3:* Evaluates document text density to choose split sizes (`spec_dense`: 400 chars, `narrative`: 1000 chars) and pre-computes spec cards.
    - *Layer 4:* Monitors total chunk counts, triggering supplementary searches for underserved devices.
  - **Concurrencies:** Added a ThreadPoolExecutor to run model crawlers and URL fetches in parallel. Added `_vault_write_lock` to thread-guard ChromaDB write transactions.
  - **Spec-Card-First RAG Retrieval:** Configured [comparison_agent_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1343) to retrieve pre-computed spec tables via metadata filters first, bypassing CPU embedding calculations.

### 🧠 Technical Decisions & Notes
- **Thread Safety:** ChromaDB reads are thread-safe, but concurrent writes require explicit locking to avoid race conditions. A global threading lock was implemented.
- **Spec Card Pre-computation:** Running specification synthesis during search ingestion avoids heavy real-time reasoning tasks during user turns, resolving comparison lags.

---

## Phase 2.5: Latency & Rate Limit Patches
**Status:** Completed  
**Date:** July 7, 2026  

### 🎯 Goal
Address Gemini API Request-Per-Minute (RPM) rate limits on the free tier and implement conversational context memory.

### 📝 Files Changed
- [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py):
  - **Hyper-Concurrency:** Configured [search_and_vault_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L951) to process all discovered models in parallel.
  - **Bulk Spec Card Synthesis:** Replaced individual spec synthesis LLM calls with `_batch_synthesise_spec_cards` helper mapping product names to specs in a single LLM request.
  - **Conversational Memory:** Configured [comparison_agent_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1343) to include the last 4 messages in prompt context.

---

## Phase 2.6: Devil's Advocate Mode (Public Consensus Decoder)
**Status:** Completed  
**Date:** July 8, 2026  

### 🎯 Goal
Add adversarial review triaging (`/advocate` command) to scrape public critique from online forums, sorting complaints by severity. Optimize RAG response latency to under 15 seconds.

### 📝 Files Changed
- [requirements.txt](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/requirements.txt): Added `apify-client>=1.7.0` for Reddit scraping.
- [.env.example](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/.env.example): Added `APIFY_API_TOKEN` placeholders.
- [agent/state.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/state.py): Added `is_advocate_mode` flag to [AgentState](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/state.py#L17).
- [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py):
  - **Pydantic Schemas:** Created [ForumInsight](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L94) and [ModelForumAnalysis](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L131) schemas.
  - **Dual Critique Harvester:** Added `_harvest_and_triage_forum_data` to scrape Reddit (Apify) and general forums (Tavily), chunking text to 500 characters and vaulting under `chunk_type="forum_critique"`.
  - **Adversarial Consensus Node:** Added [devils_advocate_consensus_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1742) to answer queries using verification counts and severity weights.
  - **Parallel Spec Synthesis:** Replaced the large batch call with `_parallel_synthesise_spec_cards` running concurrent LLM calls per model inside a ThreadPoolExecutor. This reduced Stage 2 processing times from ~120s to ~10-15s.
  - **LLM Thinking Budget Guard:** Configured the Gemini client with `thinking_budget=0` to disable dynamic thinking, eliminating multi-minute hangs during product comparisons.
- [main.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/main.py): Intercepted `/advocate` and `/exit` commands to toggle advocate mode.

---

## Phase 2.65: Zero-Auth Reddit Engine & Structured LLM Batch Triage
**Status:** Completed  
**Date:** July 9, 2026  

### 🎯 Goal
Bypass Apify trial paywalls and prevent Gemini Free Tier `429 RESOURCE_EXHAUSTED` rate limits during critique extraction.

### 📝 Files Changed
- [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py):
  - **Removed** Apify Client dependencies and lazy singletons.
  - **Pydantic Schema:** Added [SystemForumAnalysis](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L141) as a batch wrapper.
  - **Zero-Auth Reddit Engine:** Implemented `_fetch_reddit_json()` to fetch Reddit search JSON using a custom User-Agent.
  - **Structured LLM Batching:** Rebuilt `_harvest_and_triage_forum_data` to consolidate all forum feeds into a single text block, triaged using a single LLM pass.

---

## Phase 2.7: Legacy HTML Crawler Fallback
**Status:** Completed  
**Date:** July 9, 2026  

### 🎯 Goal
Bypass Reddit's `403 Forbidden` API restrictions on search JSON calls by crawling `old.reddit.com/search` directly.

### 📝 Files Changed
- [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py):
  - **HTML Crawler:** Implemented `_fetch_reddit_html()` to crawl `old.reddit.com/search` and extract thread titles and bodies using BeautifulSoup.

---

## Phase 2.75: Single-Request Tavily Critique Engine & Metadata URLs
**Status:** Completed  
**Date:** July 9, 2026  

### 🎯 Goal
Eliminate brittle HTML scraping of Reddit pages. Implement a single-request Tavily critique search for each product, maintaining precise source URL references.

### 📝 Files Changed
- [requirements.txt](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/requirements.txt): Removed the unused `apify-client` dependency.
- [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py):
  - **Removed** all Reddit-specific scrapers and JSON search functions.
  - **Pydantic Schema Upgrade:** Added `source_url` to [ForumInsight](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L94).
  - **Tavily Critique Engine:** Rewrote `_harvest_and_triage_forum_data()` to run exactly one natural language query per product (`"what are all the problems faced by the users of {model} on reddit"`) with `max_results=6` and `search_depth="advanced"`.
  - **URL Metadata Stamping:** Stamped source URLs above snippets in the combined corpus using `--- SOURCE URL: <url> ---` tags. The single-pass LLM extracts and propagates these URLs to the vector store.
  - **Consensus Citation:** Updated [devils_advocate_consensus_node](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py#L1742) to append the source URL or domain in parentheses at the end of each critique bullet point.
- [main.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/main.py): Cleaned status outputs to reflect single-request Tavily sweeps.

---

## Phase 2.98: Stability Update & Latency Optimization
**Status:** Completed  
**Date:** July 15, 2026  

### 🎯 Goal
Resolve thread calculation freezes and lazy model download/initialization hangs on the second turn when handling qualitative queries. Prevent client hangs by enforcing rigid timeouts.

### 📝 Files Changed
- [agent/nodes.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/agent/nodes.py):
  - **Eager Embedding Pre-Warming:** Initialized the local HuggingFace embedding model (`sentence-transformers/all-MiniLM-L6-v2`) eagerly at module-import time instead of lazily.
  - **Rigid LLM Client Timeouts:** Configured Gemini `ChatGoogleGenerativeAI` clients with a hard `request_timeout=20.0` to force socket drops at 20 seconds, preventing terminal hangs.
  - **Semantic Query Isolation:** Restricted the vector database query (`similarity_search`) to pass ONLY the latest raw user input string (`user_query`), bypassing CPU calculation loops on bloated multi-turn query strings.
  - **Context Memory Truncation:** Truncated each historical message within the LLM prompt to 2,000 characters. This aggressively strips massive markdown comparison tables from prior turns to keep context payloads slim and stable.
- [main.py](file:///c:/Users/Vijey/Documents/Product%20Recommendation%20Agent/main.py):
  - Aligned the embedding model name initialization with the canonical full HuggingFace path to reuse the pre-warmed weights.

### 🧠 Technical Decisions & Notes
- Eagerly pre-warming the HuggingFace embedding model during import ensures the CLI startup process completely absorbs the initial weight-loading cold start.
- Isolating search vectors and truncating context memory keeps CPU thread tokenization overhead minimal, maintaining fast and reliable response times under 10 seconds per turn.

