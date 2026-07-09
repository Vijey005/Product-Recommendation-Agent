"""
main.py
-------
CLI entry point for the Product Recommendation Agent -- Phase 2.

Run:
    python main.py

Prerequisites:
    1. Copy .env.example to .env and fill in GEMINI_API_KEY and TAVILY_API_KEY.
       - Gemini key: https://aistudio.google.com/app/apikey  (free)
       - Tavily key: https://app.tavily.com/home              (free)
    2. pip install -r requirements.txt

Phase 2 Flow:
    Interview phase  →  search_and_vault_node (Tavily + ChromaDB)
                     →  RAG chat mode (comparison_agent_node)
"""

from __future__ import annotations

import os
import sys
import uuid

# Reconfigure stdout to UTF-8 so emoji/Unicode characters render correctly
# on Windows terminals that default to cp1252.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ── Suppress TensorFlow/Keras noise before any ML library imports ─────────────
import os
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

from dotenv import load_dotenv
load_dotenv()

# ── Guard: ensure required API keys are set ───────────────────────────────────
_missing_keys = []
if not os.environ.get("GEMINI_API_KEY"):
    _missing_keys.append("GEMINI_API_KEY  (https://aistudio.google.com/app/apikey)")
if not os.environ.get("TAVILY_API_KEY"):
    _missing_keys.append("TAVILY_API_KEY  (https://app.tavily.com/home)")

if _missing_keys:
    print("\n❌  Missing required API keys in your .env file:\n")
    for key in _missing_keys:
        print(f"   • {key}")
    print("\n   Copy .env.example → .env and fill in the values, then re-run.\n")
    sys.exit(1)

from langchain_core.messages import HumanMessage

from agent.graph import app          # Compiled LangGraph (interview + vault)
from agent.nodes import (
    comparison_agent_node,
    configure_embeddings,
    devils_advocate_consensus_node,
    _harvest_and_triage_forum_data,
    _get_tavily,
    _get_llm_base,
)  # Direct RAG dispatch


# ─── ANSI colour helpers (degrade gracefully on Windows cmd) ──────────────────
def _c(text: str, code: str) -> str:
    """Wrap text in an ANSI colour code."""
    return f"\033[{code}m{text}\033[0m"

CYAN   = lambda t: _c(t, "96")
YELLOW = lambda t: _c(t, "93")
GREEN  = lambda t: _c(t, "92")
MAGENTA = lambda t: _c(t, "95")
DIM    = lambda t: _c(t, "2")


# ─── Banners ──────────────────────────────────────────────────────────────────
BANNER = f"""
{CYAN('╔══════════════════════════════════════════════════════════╗')}
{CYAN('║')}  🛍️   {YELLOW('AI Product Concierge')}  —  Phase 2 RAG Edition         {CYAN('║')}
{CYAN('║')}  {DIM('Gemini 2.5 Flash  ·  LangGraph  ·  ChromaDB  ·  Tavily')}  {CYAN('║')}
{CYAN('╚══════════════════════════════════════════════════════════╝')}
  Type {YELLOW("'quit'")} or press {YELLOW('Ctrl+C')} at any time to exit.
"""

RAG_BANNER = f"""
{MAGENTA('╔══════════════════════════════════════════════════════════╗')}
{MAGENTA('║')}  🧠  {YELLOW('Product Intelligence Vault')}  —  RAG Chat Mode          {MAGENTA('║')}
{MAGENTA('║')}  {DIM('All answers are grounded strictly in crawled product data')} {MAGENTA('║')}
{MAGENTA('╚══════════════════════════════════════════════════════════╝')}
  {DIM('Ask anything: comparisons, specs, pros & cons, pricing...')}
  {DIM('Type')} {YELLOW("'/advocate'")}{DIM(' to enter Devil')} {DIM("'s Advocate Mode  |  ")} {YELLOW("'quit'")}{DIM(' to exit.')}
"""

RED    = lambda t: _c(t, "91")
DIM_RED = lambda t: _c(t, "2;91")

ADVOCATE_BANNER = f"""
{RED('╔══════════════════════════════════════════════════════════╗')}
{RED('║')} 👹  {YELLOW('DEVIL')}\x27{YELLOW('S ADVOCATE MODE')} {DIM('—')} {YELLOW('Public Consensus Decoder')}  {RED('║')}
{RED('║')}  {DIM('Unmasking uncurated community bugs, defects & complaints')} {RED('║')}
{RED('╚══════════════════════════════════════════════════════════╝')}
  {DIM('All answers sourced strictly from Reddit & public forum critique data.')}
  {DIM('Type')} {YELLOW("'/exit'")}{DIM(' to return to standard spec RAG mode.')}
"""


def _print_ai(message: str, label: str = "Agent", color_fn=None) -> None:
    """Print an AI response with consistent formatting."""
    fn = color_fn or CYAN
    print(f"\n{fn(label + ':')} {message}\n")


def main() -> None:
    """Run the interactive CLI recommendation session."""

    print("⚙️  Initialising AI models...", end=" ", flush=True)
    from langchain_huggingface import HuggingFaceEmbeddings
    _embeddings = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2",
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True}
    )
    configure_embeddings(_embeddings)
    print("done ✅")

    print(BANNER)

    # ── Initialise state ──────────────────────────────────────────────────────
    session_id = str(uuid.uuid4())
    state: dict = {
        "session_id":        session_id,
        "chat_history":      [],
        "constraints":       {},
        "is_profile_complete": False,
        "retrieved_products": [],
        "is_rag_mode":       False,
        "is_advocate_mode":  False,
    }

    # ── Opening greeting ──────────────────────────────────────────────────────
    greeting = (
        "Hello! I'm your AI Product Concierge. 👋\n"
        "I'll ask you a few targeted questions to find the perfect product for you.\n\n"
        "What kind of product are you looking for today?"
    )
    _print_ai(greeting)

    # ════════════════════════════════════════════════════════════════════════════
    # PHASE A: Interview Loop
    # Runs until is_profile_complete == True, which triggers search_and_vault_node
    # ════════════════════════════════════════════════════════════════════════════
    while not state.get("is_rag_mode", False):
        try:
            user_input = input(f"{YELLOW('You:')} ").strip()
        except (KeyboardInterrupt, EOFError):
            print(f"\n\n{DIM('Session ended. Goodbye!')} 👋\n")
            return

        if user_input.lower() in {"quit", "exit", "bye", "q"}:
            print(f"\n{DIM('Session ended. Goodbye!')} 👋\n")
            return

        if not user_input:
            continue

        # Append user message to history
        state["chat_history"].append(HumanMessage(content=user_input))

        # Invoke the LangGraph (interview or vault search)
        try:
            result = app.invoke(state)
        except Exception as exc:
            print(f"\n{_c('❌  Error:', '91')} {exc}\n")
            continue

        state.update(result)

        # ── If vault search just ran → is_rag_mode is now True ────────────────
        if state.get("is_rag_mode", False):
            # Print the vault-ready overview from search_and_vault_node
            history = state.get("chat_history", [])
            if history:
                from langchain_core.messages import AIMessage
                for msg in reversed(history):
                    if isinstance(msg, AIMessage):
                        _print_ai(msg.content, label="Agent", color_fn=GREEN)
                        break
            break  # Exit interview loop → enter RAG loop below

        # ── Profile still incomplete: print next question ─────────────────────
        history = state.get("chat_history", [])
        if history:
            from langchain_core.messages import AIMessage
            last_msg = history[-1]
            if isinstance(last_msg, AIMessage):
                _print_ai(last_msg.content)

    # ════════════════════════════════════════════════════════════════════════════
    # PHASE B: RAG Chat Loop
    # Calls comparison_agent_node directly — bypasses analyzer entirely
    # ════════════════════════════════════════════════════════════════════════════
    if not state.get("is_rag_mode", False):
        # Edge case: profile completed but vault failed — already exited above
        return

    print(RAG_BANNER)

    # Show the extracted model names as a quick reference
    products = state.get("retrieved_products", [])
    if products:
        print(f"  {CYAN('📱 Extracted Models:')}")
        for i, p in enumerate(products, 1):
            print(f"    {i}. {p['name'][:80]}")
        print()

    # ── Resolved once, used by both harvester and nodes ──────────────────────
    product_names = [p["name"] for p in products if p.get("name")]
    constraints   = state.get("constraints", {})
    category_str  = constraints.get("product_category", "product")

    while True:
        try:
            user_input = input(f"{YELLOW('You:')} ").strip()
        except (KeyboardInterrupt, EOFError):
            print(f"\n\n{DIM('Session ended. Goodbye!')} 👋\n")
            break

        if user_input.lower() in {"quit", "exit", "bye", "q"}:
            print(f"\n{DIM('Session ended. Goodbye!')} 👋\n")
            break

        # ── /advocate command — activate Devil's Advocate Mode ────────────────
        if user_input.lower() == "/advocate":
            if state.get("is_advocate_mode", False):
                print(f"\n  {YELLOW('👹 Already in Devil')}\x27{YELLOW('s Advocate Mode.')} "
                      f"{DIM('Type /exit to return to spec mode.')}\n")
                continue

            state["is_advocate_mode"] = True
            print(ADVOCATE_BANNER)

            # Trigger zero-auth dual-pipeline forum harvesting for active products
            if product_names:
                print(f"\n  📡  Executing strict single-request Tavily queries for community feedback...")
                print(f"  🧠  Analyzing text batch via single structured pass (Gemini Rate Guard Engaged)...")
                try:
                    vaulted = _harvest_and_triage_forum_data(
                        products=product_names,
                        category=category_str,
                        tavily=_get_tavily(),
                        llm=_get_llm_base(),
                    )
                    print(f"  🧠  Analyzing complete text batch via single structured pass (Gemini Rate Guard Engaged)...")
                    print(f"\n  ✅  Forum harvest complete — {vaulted} critique signals vaulted.\n")
                except Exception as exc:
                    print(f"\n  ⚠️  Forum harvest encountered an error: {exc}")
                    print(f"  {DIM('Proceeding with any data already in vault...')}\n")
            continue

        # ── /exit command — deactivate Devil's Advocate Mode ─────────────────
        if user_input.lower() == "/exit":
            if not state.get("is_advocate_mode", False):
                print(f"\n  {DIM('Not in Devil')}\x27{DIM('s Advocate Mode. Type /advocate to activate it.')}\n")
                continue

            state["is_advocate_mode"] = False
            print(f"\n{MAGENTA('╔══════════════════════════════════════════════════════════╗')}")
            print(f"{MAGENTA('║')}  🧠  {YELLOW('Returning to Standard Spec RAG Mode')}                     {MAGENTA('║')}")
            print(f"{MAGENTA('╚══════════════════════════════════════════════════════════╝')}\n")
            continue

        if not user_input:
            continue

        # Append user question to history
        from langchain_core.messages import AIMessage
        state["chat_history"].append(HumanMessage(content=user_input))

        # ── Route based on active mode ─────────────────────────────────────────
        if state.get("is_advocate_mode", False):
            # Devil's Advocate Mode — answer from forum critique vault
            try:
                result = devils_advocate_consensus_node(state, user_input)
            except Exception as exc:
                print(f"\n{_c('❌  Advocate query error:', '91')} {exc}\n")
                continue

            new_messages = result.get("chat_history", [])
            state["chat_history"].extend(new_messages)

            if new_messages:
                last = new_messages[-1]
                if isinstance(last, AIMessage):
                    _print_ai(last.content, label="👹 Advocate", color_fn=RED)

        else:
            # Standard RAG Mode — answer from spec vault
            try:
                result = comparison_agent_node(state, user_input, embeddings=_embeddings)
            except Exception as exc:
                print(f"\n{_c('❌  Vault query error:', '91')} {exc}\n")
                continue

            new_messages = result.get("chat_history", [])
            state["chat_history"].extend(new_messages)

            if new_messages:
                last = new_messages[-1]
                if isinstance(last, AIMessage):
                    _print_ai(last.content, label="Vault", color_fn=MAGENTA)


if __name__ == "__main__":
    main()
