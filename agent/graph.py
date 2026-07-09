"""
agent/graph.py
──────────────
Assembles the LangGraph StateGraph for the Product Recommendation Agent.

Phase 2 Graph topology:
                    ┌───────────────────┐
                    │   analyzer_node   │  ← Entry point (interview turns)
                    └────────┬──────────┘
                             │
               is_profile_complete?
              ┌──────────────┤
           False           True
              │              │
              ▼              ▼
  question_generator  search_and_vault_node
       _node               │
              │              ▼
              ▼            END
            END

Note: Once is_rag_mode=True, main.py dispatches user queries directly to
      comparison_agent_node, bypassing the LangGraph interview loop entirely.
      This avoids running the constraint analyzer on comparison questions.
"""

from __future__ import annotations

from langgraph.graph import END, StateGraph

from agent.nodes import (
    analyzer_node,
    question_generator_node,
    search_and_vault_node,
)
from agent.state import AgentState

# ─── Node name constants ──────────────────────────────────────────────────────
ANALYZER     = "analyzer_node"
QUESTION_GEN = "question_generator_node"
VAULT_SEARCH = "search_and_vault_node"


def _route_after_analysis(state: AgentState) -> str:
    """
    Conditional routing function evaluated after analyzer_node runs.

    Returns the name of the next node to execute based on current state:
      - is_profile_complete == False → question_generator_node
      - is_profile_complete == True  → search_and_vault_node
    """
    if state.get("is_profile_complete", False):
        return VAULT_SEARCH
    return QUESTION_GEN


def build_graph() -> any:
    """
    Construct, wire, and compile the LangGraph StateGraph.

    Returns
    -------
    CompiledGraph — the runnable LangGraph application.
    """
    graph = StateGraph(AgentState)

    # ── Register nodes ────────────────────────────────────────────────────────
    graph.add_node(ANALYZER,     analyzer_node)
    graph.add_node(QUESTION_GEN, question_generator_node)
    graph.add_node(VAULT_SEARCH, search_and_vault_node)

    # ── Set entry point ───────────────────────────────────────────────────────
    graph.set_entry_point(ANALYZER)

    # ── Conditional edge: analyzer → (question_gen | vault_search) ────────────
    graph.add_conditional_edges(
        ANALYZER,
        _route_after_analysis,
        {
            QUESTION_GEN: QUESTION_GEN,
            VAULT_SEARCH: VAULT_SEARCH,
        },
    )

    # ── Terminal edges ────────────────────────────────────────────────────────
    graph.add_edge(QUESTION_GEN, END)
    graph.add_edge(VAULT_SEARCH, END)

    return graph.compile()


# Module-level compiled graph — import and use directly in main.py
app = build_graph()
