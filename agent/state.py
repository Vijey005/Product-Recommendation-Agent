"""
agent/state.py
──────────────
Defines the persistent LangGraph state that flows through every node.
All fields are carried across the entire conversation lifecycle.
"""

from __future__ import annotations

from typing import Annotated, Any, Dict, List
from typing_extensions import TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """
    The single source of truth shared across all LangGraph nodes.

    Fields
    ------
    session_id : str
        UUID identifying this terminal session. Useful for future
        persistence or LangSmith grouping.

    chat_history : List[BaseMessage]
        Full conversation so far (HumanMessage / AIMessage).
        The `add_messages` reducer appends new messages rather than
        overwriting, so we never lose history.

    constraints : Dict[str, Any]
        Structured product preferences extracted from the conversation.
        Populated and updated by the analyzer_node on every turn.

    is_profile_complete : bool
        Routing flag. Set to True by analyzer_node when enough
        constraints have been gathered to trigger a product search.

    retrieved_products : List[Dict[str, Any]]
        List of product metadata dicts found during the vault search.
        Each dict contains at minimum: {'name', 'url', 'snippet'}.
        Populated by search_and_vault_node after a successful search.

    is_rag_mode : bool
        When True, the main CLI loop bypasses the interview phase and
        routes all user input directly to comparison_agent_node. Set
        to True by search_and_vault_node once the vault is populated.

    is_advocate_mode : bool
        When True, the main CLI loop routes all user input to
        devils_advocate_consensus_node instead of comparison_agent_node.
        Activated by typing /advocate in the RAG chat loop; deactivated
        by typing /exit. Defaults to False.
    """

    session_id: str
    chat_history: Annotated[List[BaseMessage], add_messages]
    constraints: Dict[str, Any]
    is_profile_complete: bool
    retrieved_products: List[Dict[str, Any]]
    is_rag_mode: bool
    is_advocate_mode: bool
