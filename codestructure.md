# Code Structure: Product Recommendation Agent

This document explains the architecture and workflow of the Product Recommendation Agent codebase.

## Overview
The Product Recommendation Agent is a CLI-based AI concierge built using **LangGraph**, **Gemini 2.5 Flash**, **ChromaDB**, and **Tavily**. 

The system operates in two distinct phases:
1. **Interview Phase (LangGraph Loop):** The agent asks targeted questions to understand the user's product preferences. It extracts constraints iteratively until a complete profile is built.
2. **RAG Chat Mode:** Once the profile is complete, the agent searches the web for matching products, stores their deep specifications into a local vector database (ChromaDB), and enters a retrieval-augmented generation (RAG) chat mode where users can ask for comparisons grounded entirely on the fetched data.

---

## File Structure & Responsibilities

### 1. `main.py`
**Role:** The entry point and main orchestrator of the CLI application.
**Functions:**
- Loads environment variables (`GEMINI_API_KEY`, `TAVILY_API_KEY`).
- Initializes the `AgentState`.
- Manages the **Phase A: Interview Loop**, taking user input and feeding it to the compiled LangGraph application (`app.invoke(state)`).
- Transitions to **Phase B: RAG Chat Loop** once `is_rag_mode` becomes `True`. In this phase, it directly dispatches user queries to the `comparison_agent_node`, bypassing the LangGraph interview flow.

### 2. `agent/state.py`
**Role:** Defines the single source of truth for the LangGraph state.
**Functions:**
- Defines `AgentState` (a `TypedDict`) that flows through every node.
- Key fields include:
  - `chat_history`: The conversation so far.
  - `constraints`: Extracted product preferences.
  - `is_profile_complete`: A boolean flag determining if enough info is gathered.
  - `retrieved_products`: List of discovered products.
  - `is_rag_mode`: A boolean flag that transitions the app into RAG mode.
  - `is_advocate_mode`: A boolean routing flag. When `True`, routes queries to `devils_advocate_consensus_node` for adversarial critique analysis.

### 3. `agent/models.py`
**Role:** Data validation and structured constraint definition.
**Functions:**
- Defines `ProductConstraints` as a Pydantic `BaseModel`.
- Contains fields like `product_category`, `budget_min`, `budget_max`, `primary_use_case`, `hard_requirements`, `preferred_brands`, etc.
- Used by the LLM (via structured output) to safely parse and store user requirements. Provides helper methods to check `filled_fields` and `missing_fields`.

### 4. `agent/graph.py`
**Role:** Assembles the LangGraph StateGraph topology.
**Functions:**
- Registers nodes and defines the execution flow.
- Sets `analyzer_node` as the entry point.
- Uses a conditional router (`_route_after_analysis`) to decide the next step:
  - If `is_profile_complete == False` → goes to `question_generator_node`.
  - If `is_profile_complete == True` → goes to `search_and_vault_node`.

### 5. `agent/nodes.py`
**Role:** Contains the core execution logic for the nodes in the graph, the standard RAG node, and the adversarial advocate node.
**Pydantic Forum Analytics Schemas:**
- **`ForumInsight`:** Structures extracted user complaints, classifying them strictly into *Constructive Criticism*, *Sarcastic/Meme Noise*, *Unsubstantiated Hate*, or *Legitimate Praise*. Includes severity weights (1-5) and underlying issues.
- **`ModelForumAnalysis`:** Aggregates a list of verified `ForumInsight` items per product.
**Functions:**
- **`analyzer_node`:** 
  - Reads the chat history and uses an LLM with structured output to extract `ProductConstraints`. 
  - Updates the state constraints and checks if the profile is complete (requires at least 5 filled fields).
- **`question_generator_node`:** 
  - Looks at missing constraints and generates the next best, most impactful follow-up question (e.g., asking for budget, category, or use case) offering 3-4 numbered options.
- **`search_and_vault_node`:** 
  - Triggers when the profile is complete. Executes a two-stage harvesting engine:
    - *Stage 1 (Discovery):* Uses Tavily to search for products matching the user's constraints and extracts 5-6 qualifying model names via an LLM curator.
    - *Stage 2 (Harvester):* A highly parallelized four-layer architecture:
      - **Layer 1:** LLM generates category-aware query templates.
      - **Layer 2 (Hyper-concurrency):** Runs all models in parallel (`max_workers=max(1, len(discovered_models))`). Within each model harvesting thread, Tavily query templates are executed concurrently using a nested thread pool of size 4 to deduplicate target URLs, removing sequential fetch delays.
      - **Layer 3 (Adaptive Chunking & Parallel Spec Synthesis):** Parallel workers fetch and chunk page text adaptively (`spec_dense` vs `narrative`). Spec card synthesis is completed in parallel via `_parallel_synthesise_spec_cards` which runs concurrent LLM calls per model inside a ThreadPoolExecutor. This reduces Stage 2 processing times from ~60s down to ~10-15s.
      - **Layer 4:** Verifies vault coverage and runs supplementary searches for underserved models.
  - Updates `retrieved_products` and sets `is_rag_mode = True`.
- **`comparison_agent_node`:** 
  - Used directly in standard RAG Chat Mode. 
  - Employs a hybrid retrieval strategy: for comparison queries, it first fetches pre-synthesised spec cards using a fast metadata filter (bypassing CPU embeddings), then supplements with one targeted similarity search for specific qualitative context.
  - Injects recent conversation history (the last 3-4 messages) to provide RAG conversational memory for follow-up turns.
  - **Gemini Optimization:** Initializes `ChatGoogleGenerativeAI` with `thinking_budget=0` to disable dynamic thinking, eliminating multi-minute hangs during product comparisons.
- **`_harvest_and_triage_forum_data`:**
  - Activated when `/advocate` is invoked. Implements a hyper-efficient, single-request Tavily architecture per product, completely abandoning external Reddit scrapers or HTML hacks.
  - Runs exactly one advanced Tavily search query per product (`"what are all the problems faced by the users of {model} on reddit"`) with `max_results=6`.
  - Stamps source URLs directly into a global master corpus using `--- SOURCE URL: <url> ---` headers.
  - Executes exactly **one single LLM pass** using structured output (`SystemForumAnalysis`) to parse, triage, and route all product insights in a single window, preventing Gemini API 429 rate limits.
  - Actionable insights are vaulted into ChromaDB under `chunk_type="forum_critique"` with their extracted `source_url` stored in the document metadata.
- **`devils_advocate_consensus_node`:**
  - Queries `forum_critique` chunks from ChromaDB.
  - Formats retrieved chunks to include their source URLs.
  - Synthesizes a consensus summary sorted by complaint severity.
  - Prepends descriptions with a count of verified discussions (e.g., `"🔴 [Sourced from N independent community reports - Severity Weight: X/5]: ..."`) and appends the source URL or domain in parentheses at the end of each bullet point.

---

## Workflow Communication

1. **Start:** The user runs `python main.py`. The initial greeting is printed, and the `AgentState` is initialized.
2. **Extraction:** The user types a response. `main.py` passes the state to the LangGraph (`app.invoke`). The `analyzer_node` extracts preferences into `ProductConstraints` and evaluates completeness.
3. **Questioning:** If incomplete, the graph routes to `question_generator_node`, which returns a targeted question to the user. This loop repeats until the completeness threshold is met.
4. **Harvesting:** Once complete, the graph routes to `search_and_vault_node`. It performs broad and targeted searches via `TavilyClient`, chunks the text using `RecursiveCharacterTextSplitter`, and embeds/stores it in `ChromaDB` using `HuggingFaceEmbeddings`.
5. **Mode Switch:** The `search_and_vault_node` sets `is_rag_mode = True`. The graph execution ends.
6. **RAG Mode:** `main.py` detects `is_rag_mode` and breaks out of the LangGraph loop. All subsequent user queries are sent straight to `comparison_agent_node` (unless advocate mode is triggered).
7. **Devil's Advocate Trigger:** If the user sends `/advocate`, the console switches state, scrapes Reddit (Apify) & general forums (Tavily) concurrently, structures the sentiment critique data, and vaults it.
8. **Answering:** Standard queries are processed by `comparison_agent_node` using spec cards. Advocate queries are routed to `devils_advocate_consensus_node` returning verified severity-weighted complaints.
