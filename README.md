# Product Recommendation Agent — Phase 1

An autonomous, conversational product recommendation agent powered by **Gemini 1.5 Flash** and **LangGraph**. Phase 1 is a CLI prototype that dynamically interviews the user and builds a structured constraint profile before triggering a product search.

---

## Project Structure

```
Product Recommendation Agent/
├── .env                   # Your secrets (create from .env.example)
├── .env.example           # API key template
├── .gitignore
├── requirements.txt
├── main.py                # ← Run this
└── agent/
    ├── __init__.py
    ├── state.py           # LangGraph TypedDict state schema
    ├── models.py          # Pydantic constraint extraction model
    ├── nodes.py           # analyzer, question_generator, mock_search nodes
    └── graph.py           # StateGraph wiring & compilation
```

---

## Quick Start

### 1. Get a Free Gemini API Key

Visit [Google AI Studio](https://aistudio.google.com/app/apikey) → **Create API Key** (completely free).

### 2. Set Up Your Environment

```powershell
# Navigate to the project folder
cd "c:\Users\Vijey\Documents\Product Recommendation Agent"

# Create .env from the template
copy .env.example .env
```

Open `.env` and replace `your_gemini_api_key_here` with your actual key:

```
GEMINI_API_KEY=AIza...your_key_here...
```

### 3. Install Dependencies

```powershell
pip install -r requirements.txt
```

### 4. Run the Agent

```powershell
python main.py
```

---

## Example Session

```
Agent: Hello! I'm your AI Product Concierge. 👋
       What kind of product are you looking for today?

You: I need a good laptop for uni

Agent: Great! To help narrow it down, what will you mainly use it for?
       1. Taking notes and browsing the web
       2. Programming / software development
       3. Creative work (design, video, music)
       4. Gaming on the side
       5. Something else — tell me!

You: Mostly notes and coding

Agent: What's your budget range?
       1. Under $500
       2. $500–$800
       3. $800–$1,200
       4. Over $1,200 — money's not a big concern
       5. Something else — tell me!

You: Around $900 max

Agent: Do you have a preferred operating system?
       1. Windows — most flexibility
       2. macOS — polished and great battery life
       3. Linux — I like to tinker
       4. No preference
       ...

──────────────────────────────────────────────────────────
  ✅  USER PROFILE COMPLETE — Ready to Search
──────────────────────────────────────────────────────────
  Product Category      : laptop
  Budget Max (USD)      : 900.0
  Primary Use Case      : college student / coding
  Hard Requirements     : portable, good keyboard
  Operating System      : Windows
──────────────────────────────────────────────────────────
  🔍  [Phase 2] Search & ranking engine will be invoked here.
```

---

## Optional: LangSmith Tracing

To visualise agent routing and LLM calls in the [LangSmith](https://smith.langchain.com/) dashboard (free developer tier):

1. Sign up at smith.langchain.com → copy your API key.
2. Uncomment these lines in your `.env`:

```
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_langsmith_key_here
LANGCHAIN_PROJECT=product-recommendation-agent
```

---

## Architecture

```
User Input
    │
    ▼
analyzer_node  ──── extracts ProductConstraints via Gemini structured output
    │
    ├─ is_profile_complete=False ──► question_generator_node ──► prints question ──► END (awaits next input)
    │
    └─ is_profile_complete=True  ──► search_orchestrator_mock_node ──► prints summary ──► END
```

**Completion threshold:** ≥ 3 meaningful constraint fields populated (configurable in `agent/nodes.py` → `COMPLETION_THRESHOLD`).

---

## Coming in Phase 2

- Real-time web scraping (Amazon, BestBuy, GSMArena)
- LLM-powered product ranking and comparison
- Structured product report with pros/cons
