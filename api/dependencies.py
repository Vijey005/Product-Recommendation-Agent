"""
api/dependencies.py
───────────────────
Phase 3.0 — FastAPI dependency injection and shared singletons.

Responsibilities:
  1. Pre-warm the HuggingFace embedding model at import time (mirrors the
     Phase 2.98 startup warm-up in main.py — prevents cold-start RAG freezes).
  2. Compile the interview LangGraph with a MemorySaver checkpointer so
     multi-turn interview conversations persist across separate HTTP requests.
  3. Maintain an in-memory SessionStore that holds per-session AgentState dicts.
     HTTP is stateless, but our agent is conversational — this bridges the gap.
  4. Expose FastAPI Depends factories consumed by api/routes.py.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict

# ── Must be set BEFORE any transformers/sentence-transformers import ───────────
os.environ.setdefault("TRANSFORMERS_NO_TF", "1")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

from dotenv import load_dotenv

load_dotenv()

from langchain_huggingface import HuggingFaceEmbeddings
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from agent.nodes import (
    analyzer_node,
    configure_embeddings,
    question_generator_node,
    search_and_vault_node,
)
from agent.state import AgentState

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# SINGLETON: HuggingFace Embedding Model
# ─────────────────────────────────────────────────────────────────────────────
# Loaded once at module import time.  All node functions in nodes.py that call
# _get_embeddings() or _get_vectorstore() will receive this pre-warmed instance
# via configure_embeddings(), eliminating cold-start thread hangs.
# ─────────────────────────────────────────────────────────────────────────────

logger.info("⚙️  Pre-warming HuggingFace embedding model (all-MiniLM-L6-v2)…")
_embeddings: HuggingFaceEmbeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2",
    model_kwargs={"device": "cpu"},
    encode_kwargs={"normalize_embeddings": True},
)
# Register the singleton with nodes.py so every node function shares the
# exact same object — no duplicate model loads, no concurrency issues.
configure_embeddings(_embeddings)
logger.info("✅  Embedding model ready.")


# ─────────────────────────────────────────────────────────────────────────────
# SINGLETON: LangGraph Interview Graph (compiled with MemorySaver)
# ─────────────────────────────────────────────────────────────────────────────
# We re-build the StateGraph here (mirroring graph.py) so we can attach
# a MemorySaver checkpointer.  The module-level `app` in graph.py is compiled
# without a checkpointer (used only by the legacy main.py CLI).
# ─────────────────────────────────────────────────────────────────────────────

_ANALYZER     = "analyzer_node"
_QUESTION_GEN = "question_generator_node"
_VAULT_SEARCH = "search_and_vault_node"
_checkpointer = MemorySaver()


def _route_after_analysis(state: AgentState) -> str:
    """Mirrors graph.py routing — needed here to wire the memory-backed graph."""
    if state.get("is_profile_complete", False):
        return _VAULT_SEARCH
    return _QUESTION_GEN


def _build_graph_with_memory():
    """Construct the interview StateGraph and compile it with MemorySaver."""
    g = StateGraph(AgentState)
    g.add_node(_ANALYZER,     analyzer_node)
    g.add_node(_QUESTION_GEN, question_generator_node)
    g.add_node(_VAULT_SEARCH, search_and_vault_node)
    g.set_entry_point(_ANALYZER)
    g.add_conditional_edges(
        _ANALYZER,
        _route_after_analysis,
        {_QUESTION_GEN: _QUESTION_GEN, _VAULT_SEARCH: _VAULT_SEARCH},
    )
    g.add_edge(_QUESTION_GEN, END)
    g.add_edge(_VAULT_SEARCH, END)
    return g.compile(checkpointer=_checkpointer)


app_with_memory = _build_graph_with_memory()
logger.info("✅  LangGraph interview graph compiled with MemorySaver.")


# ─────────────────────────────────────────────────────────────────────────────
# SESSION STORE
# ─────────────────────────────────────────────────────────────────────────────
# HTTP is stateless but our agent is multi-turn.  This dict maps each
# session_id (UUID string) to the AgentState dict for that session.
#
# Lifecycle:
#   • Created on the first POST /chat for a new session_id.
#   • Updated in-place after every graph invocation or node call.
#   • Retrieved by GET /session/{session_id} for the frontend to read.
#
# Production note: for horizontal scaling, replace with Redis or a persistent
# LangGraph AsyncSqliteSaver checkpoint store.
# ─────────────────────────────────────────────────────────────────────────────

SessionStore: Dict[str, Dict[str, Any]] = {}


def get_or_create_session(session_id: str) -> Dict[str, Any]:
    """
    Return the existing session state for this ID, or initialise a fresh one.

    The default fields mirror what main.py initialises at lines 136-144.
    """
    if session_id not in SessionStore:
        SessionStore[session_id] = {
            "session_id":          session_id,
            "chat_history":        [],
            "constraints":         {},
            "is_profile_complete": False,
            "retrieved_products":  [],
            "is_rag_mode":         False,
            "is_advocate_mode":    False,
        }
    return SessionStore[session_id]


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Dependency Factories
# ─────────────────────────────────────────────────────────────────────────────

def get_agent_app():
    """
    FastAPI Depends factory.

    Returns the singleton compiled LangGraph application (with MemorySaver
    checkpointer) for use by route handlers.

    Usage in routes:
        @router.post("/chat")
        async def chat(agent=Depends(get_agent_app)):
            result = await agent.ainvoke(...)
    """
    return app_with_memory


def get_embeddings() -> HuggingFaceEmbeddings:
    """Return the pre-warmed embedding model singleton."""
    return _embeddings
