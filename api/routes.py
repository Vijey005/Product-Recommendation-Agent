"""
api/routes.py
─────────────
Phase 3.0 — API routes, Pydantic schemas, and SSE streaming logic.

Route inventory:
  GET  /health                           — liveness probe
  GET  /api/v1/session/{session_id}      — read current session state
  POST /api/v1/chat                      — primary SSE chat endpoint (interview + RAG)
  POST /api/v1/advocate                  — Devil's Advocate critique, streamed via SSE

Streaming design:
  • Interview phase (is_rag_mode == False):
      Uses app_with_memory.astream_events() which natively yields token-level
      events from the LangGraph execution.  We forward "on_chat_model_stream"
      events to the client as SSE data frames.

  • RAG chat phase (is_rag_mode == True):
      comparison_agent_node is synchronous/blocking.  We reconstruct its
      context-retrieval logic here (identical message chain) and call
      _get_llm_base().astream() to emit tokens in real-time, then persist
      the complete response back to the session store.

  • Advocate phase:
      _harvest_and_triage_forum_data runs blocking I/O (Tavily + ChromaDB
      + time.sleep).  We offload it to asyncio.to_thread(), then stream the
      adversarial LLM response token-by-token via astream().

Rate limiting:
  The @limiter.limit("20/minute") decorator on /api/v1/chat enforces the
  PRD requirement to protect Tavily and Gemini free-tier quotas.
"""


import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from agent.nodes import (
    _extract_text_from_content,
    _get_llm_base,
    _get_vectorstore,
    _harvest_and_triage_forum_data,
    _get_tavily,
    ADVOCATE_TOP_K,
    RAG_TOP_K,
    COMPARISON_KEYWORDS,
    RECOMMENDATION_KEYWORDS,
    _has_intent,
    _format_budget,
)
from agent.models import ProductConstraints
from api.dependencies import (
    app_with_memory,
    get_agent_app,
    get_embeddings,
    get_or_create_session,
    SessionStore,
)

logger = logging.getLogger(__name__)

# ─── Rate Limiter ─────────────────────────────────────────────────────────────
# The Limiter instance must be created here AND registered on the FastAPI app
# in server.py.  Routes import the instance to apply per-route limits.
limiter = Limiter(key_func=get_remote_address)


# ═════════════════════════════════════════════════════════════════════════════
# PYDANTIC SCHEMAS  (must be defined BEFORE router = APIRouter() so that
# Pydantic v2 resolves all type annotations eagerly at class-definition time.
# from __future__ import annotations is intentionally absent from this file.)
# ═════════════════════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    """Payload for the primary chat endpoint."""
    session_id: str = Field(
        ...,
        description="Unique UUID identifying the user session. Generate client-side with crypto.randomUUID().",
    )
    message: str = Field(
        ...,
        description="The user's text input (interview answer or RAG question).",
        min_length=1,
        max_length=4000,
    )


class AdvocateRequest(BaseModel):
    """Payload for the Devil's Advocate critique endpoint."""
    session_id: str = Field(
        ...,
        description="UUID of an existing session that has completed the interview phase (is_rag_mode must be True).",
    )
    product_name: str = Field(
        ...,
        description="The specific product model to critique. Must be one of the retrieved_products for this session.",
        min_length=1,
        max_length=200,
    )


class SessionStateResponse(BaseModel):
    """Read-only snapshot of session state returned by GET /session/{session_id}."""
    session_id: str
    is_profile_complete: bool
    is_rag_mode: bool
    is_advocate_mode: bool
    retrieved_products: List[Dict[str, Any]]
    constraints: Dict[str, Any]
    message_count: int


# ─── Router ───────────────────────────────────────────────────────────────────
# Instantiated AFTER schema classes so FastAPI's route registration sees fully
# evaluated Pydantic models, not deferred ForwardRef strings.
router = APIRouter()


# ═════════════════════════════════════════════════════════════════════════════
# HELPER: SSE event formatter
# ═════════════════════════════════════════════════════════════════════════════

def _sse_event(data: Any, event: str = "message") -> str:
    """
    Format a single Server-Sent Event frame.

    SSE wire format (RFC 8895):
        event: <event-name>\\n
        data: <json-payload>\\n
        \\n

    The client EventSource parses this and fires `evt.data` as the JSON string.
    """
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


def _sse_token(token: str) -> str:
    """Convenience wrapper — emits a single token chunk as an SSE message."""
    return _sse_event({"type": "token", "content": token})


def _sse_done(metadata: Dict[str, Any] | None = None) -> str:
    """Terminal SSE frame — signals stream completion to the client."""
    return _sse_event({"type": "done", **(metadata or {})})


def _sse_error(message: str) -> str:
    """Error SSE frame — client can surface this as a toast notification."""
    return _sse_event({"type": "error", "message": message}, event="error")


def _sse_status(message: str) -> str:
    """
    Status update frame — used for long-running background operations
    (e.g. 'Harvesting product data…') so the UI can show a progress indicator.
    """
    return _sse_event({"type": "status", "message": message}, event="status")


# ═════════════════════════════════════════════════════════════════════════════
# STREAMING GENERATORS
# ═════════════════════════════════════════════════════════════════════════════

async def _stream_interview_phase(
    session_id: str,
    state: Dict[str, Any],
    agent,
) -> AsyncGenerator[str, None]:
    """
    Stream the interview graph (analyzer → question_generator OR vault_search)
    using LangGraph's astream_events() API.

    LangGraph config `thread_id` ties this invocation to the MemorySaver
    checkpoint, preserving conversation history across HTTP calls.

    Yields SSE frames:
      • token frames   — each text chunk from the LLM as it generates
      • status frames  — node entry/exit for long-running vault search
      • done frame     — includes updated session metadata
    """
    config = {"configurable": {"thread_id": session_id}}

    full_response = ""
    final_state: Dict[str, Any] = {}

    try:
        async for event in agent.astream_events(state, config=config, version="v2"):
            kind = event.get("event", "")
            name = event.get("name", "")

            # ── Token stream ──────────────────────────────────────────────────
            if kind == "on_chat_model_stream":
                chunk = event.get("data", {}).get("chunk")
                if chunk and hasattr(chunk, "content"):
                    content = chunk.content
                    # Gemini may return list-format content parts
                    if isinstance(content, list):
                        content = "".join(
                            p if isinstance(p, str) else p.get("text", "")
                            for p in content
                        )
                    if content:
                        full_response += content
                        yield _sse_token(content)

            # ── Node status signals ───────────────────────────────────────────
            elif kind == "on_chain_start" and name == "search_and_vault_node":
                yield _sse_status("🔍 Searching for products and building your vault…")

            elif kind == "on_chain_end" and name == "search_and_vault_node":
                yield _sse_status("✅ Product vault ready!")

            # ── Capture final graph output ────────────────────────────────────
            elif kind == "on_chain_end" and name == "LangGraph":
                output = event.get("data", {}).get("output", {})
                if isinstance(output, dict):
                    final_state = output

    except Exception as exc:
        logger.exception("Interview stream error for session %s", session_id)
        yield _sse_error(f"Stream interrupted: {exc}")
        return

    # ── Persist updated state ─────────────────────────────────────────────────
    if final_state:
        state.update(final_state)
        # Normalise chat_history — LangGraph may return Message objects
        if "chat_history" in final_state:
            existing = state.get("chat_history", [])
            new_msgs = final_state["chat_history"]
            # Avoid duplicates: extend only with genuinely new messages
            existing_contents = {
                m.content if hasattr(m, "content") else str(m)
                for m in existing
            }
            for msg in new_msgs:
                msg_content = msg.content if hasattr(msg, "content") else str(msg)
                if msg_content not in existing_contents:
                    existing.append(msg)
                    existing_contents.add(msg_content)
            state["chat_history"] = existing

    # Always persist the canonical fields even if no LangGraph output captured
    SessionStore[session_id] = state

    yield _sse_done({
        "is_rag_mode":         state.get("is_rag_mode", False),
        "is_profile_complete": state.get("is_profile_complete", False),
        "retrieved_products":  state.get("retrieved_products", []),
    })


async def _stream_rag_phase(
    session_id: str,
    state: Dict[str, Any],
    user_query: str,
    embeddings,
) -> AsyncGenerator[str, None]:
    """
    Stream a RAG-phase response for a comparison / spec question.

    We reconstruct the exact message chain that comparison_agent_node builds
    (nodes.py lines 1419-1630) but call astream() on the LLM for token-level
    delivery.  The synchronous context-retrieval steps (ChromaDB similarity
    search) run in asyncio.to_thread() so the event loop is not blocked.

    Yields SSE frames: token, status, done.
    """
    # ── Step 1: Retrieve vault context (blocking ChromaDB I/O → thread) ───────
    yield _sse_status("🔎 Searching product vault…")

    def _build_rag_context():
        """
        Mirrors comparison_agent_node context-building (nodes.py ~L1448-1541).
        Returns (context_block, system_prompt_text, has_comparison, has_recommendation).
        """
        vs = _get_vectorstore(embeddings)
        constraints_raw = state.get("constraints", {})
        constraints = ProductConstraints(**constraints_raw) if constraints_raw else ProductConstraints()
        retrieved_products = state.get("retrieved_products", [])
        extracted_model_names = [p.get("name") for p in retrieved_products if p.get("name")]

        has_comparison_intent     = _has_intent(user_query, COMPARISON_KEYWORDS)
        has_recommendation_intent = _has_intent(user_query, RECOMMENDATION_KEYWORDS)

        docs = []
        if has_comparison_intent and extracted_model_names:
            # Spec card pull (metadata filter — no embedding computation)
            class _FakeDoc:
                def __init__(self, content: str, metadata: dict):
                    self.page_content = content
                    self.metadata     = metadata

            spec_card_docs = []
            for model_name in extracted_model_names:
                try:
                    sc_result = vs.get(
                        where={
                            "$and": [
                                {"product_name": {"$eq": model_name}},
                                {"chunk_type":   {"$eq": "spec_card"}},
                            ]
                        }
                    )
                    if sc_result and sc_result.get("documents"):
                        for doc_text, meta in zip(sc_result["documents"], sc_result["metadatas"]):
                            spec_card_docs.append(_FakeDoc(doc_text, meta))
                except Exception:
                    pass

            try:
                similarity_docs = vs.similarity_search(user_query, k=RAG_TOP_K)
            except Exception:
                similarity_docs = []

            seen_contents = {doc.page_content for doc in spec_card_docs}
            deduped = [d for d in similarity_docs if d.page_content not in seen_contents]
            docs = spec_card_docs + deduped
        else:
            try:
                docs = vs.similarity_search(user_query, k=RAG_TOP_K)
            except Exception:
                docs = []

        if not docs:
            return None, None, has_comparison_intent, has_recommendation_intent

        # Build context block
        context_parts = []
        for doc in docs:
            meta     = doc.metadata
            src_name = meta.get("product_name", "Unknown Product")
            src_url  = meta.get("source_url", "")
            context_parts.append(
                f"### Source: {src_name}\n(URL: {src_url})\n\n{doc.page_content}"
            )
        context_block = "\n\n---\n\n".join(context_parts)

        # Build system prompt (mirrors nodes.py L1543-1584)
        models_str = ", ".join(extracted_model_names) if extracted_model_names else "None listed"
        user_context_block = ""
        recommendation_rule = "6. Do not include a final recommendation unless the user explicitly asks for one."

        if has_recommendation_intent:
            user_context_block = (
                f"The user's profile is:\n"
                f"- Product category: {constraints.product_category or 'Not specified'}\n"
                f"- Primary use case: {constraints.primary_use_case or 'Not specified'}\n"
                f"- Additional context: {constraints.additional_notes or 'None'}\n"
                f"- Budget: {_format_budget(constraints)}\n\n"
                f"Frame your recommendation specifically around this use case and profile.\n"
                f"Identify which specs matter most FOR THIS USER given their context —\n"
                f"do not default to generic importance rankings.\n"
                f"Make a clear, justified final recommendation. Do not hedge with\n"
                f"'if X matters consider Y'. Pick one product and explain why using\n"
                f"only the retrieved data.\n"
                f"If a product exceeds the stated budget, flag it clearly in your answer.\n\n"
            )
            recommendation_rule = (
                "6. End with a clear, justified final recommendation based only on "
                "the crawled data and the user's profile."
            )

        system_prompt_text = (
            user_context_block +
            "You are an expert product concierge. "
            "You have been given excerpts scraped directly from product review pages and spec sheets. "
            "\n\n"
            f"You are ONLY discussing the models the user has requested: {models_str}. "
            "You are strictly FORBIDDEN from discussing or introducing any other models "
            "that might appear in the raw text chunks if they are not in this list.\n\n"
            "RULES — follow them without exception:\n"
            "1. Review the retrieved text chunks and answer the user's question.\n"
            "2. Present a clean markdown comparison table when comparing multiple products.\n"
            "3. Only discuss the models listed above. Do NOT introduce any others.\n"
            "4. If a spec is missing for a specific model in the context, write exactly: "
            "   'Not available in data' — do NOT guess or hallucinate.\n"
            "5. Be concise and factual — no marketing language.\n"
            f"{recommendation_rule}"
        )

        return context_block, system_prompt_text, has_comparison_intent, has_recommendation_intent

    context_block, system_prompt_text, _, _ = await asyncio.to_thread(_build_rag_context)

    if context_block is None:
        yield _sse_token(
            "⚠️ I couldn't find relevant information in the Product Intelligence Vault "
            "for your query. Try rephrasing, or ask about a specific product or spec."
        )
        yield _sse_done()
        return

    # ── Step 2: Build message list (mirrors nodes.py L1586-1614) ─────────────
    history = state.get("chat_history", [])
    recent_history = []
    if history:
        history_to_consider = history[:-1] if len(history) > 0 else history
        raw_slice = history_to_consider[-4:]
        for msg in raw_slice:
            raw_content = msg.content if hasattr(msg, "content") else str(msg)
            if isinstance(raw_content, list):
                raw_content = " ".join(
                    p if isinstance(p, str) else p.get("text", "")
                    for p in raw_content
                )
            truncated = str(raw_content)[:2000]
            if isinstance(msg, HumanMessage):
                recent_history.append(HumanMessage(content=truncated))
            else:
                recent_history.append(AIMessage(content=truncated))

    from langchain_core.messages import SystemMessage
    messages = (
        [SystemMessage(content=system_prompt_text)]
        + recent_history
        + [HumanMessage(content=f"[VAULT CONTEXT]\n\n{context_block}\n\n[USER QUESTION]\n{user_query}")]
    )

    # ── Step 3: Stream LLM response token-by-token ────────────────────────────
    full_response = ""
    try:
        llm = _get_llm_base()
        async for chunk in llm.astream(messages):
            content = chunk.content
            if isinstance(content, list):
                content = "".join(
                    p if isinstance(p, str) else p.get("text", "")
                    for p in content
                )
            if content:
                full_response += content
                yield _sse_token(content)
    except Exception as exc:
        logger.exception("RAG stream error for session %s", session_id)
        yield _sse_error(f"LLM stream error: {exc}")
        return

    # ── Persist AI response to session history ────────────────────────────────
    if full_response:
        state["chat_history"].append(AIMessage(content=full_response))
    SessionStore[session_id] = state

    yield _sse_done({"is_rag_mode": True})


async def _stream_advocate_phase(
    session_id: str,
    state: Dict[str, Any],
    product_name: str,
    user_query: str,
) -> AsyncGenerator[str, None]:
    """
    Stream a Devil's Advocate response for a specific product.

    Pipeline:
      1. Run _harvest_and_triage_forum_data in a thread (blocking Tavily + sleep).
      2. Retrieve forum_critique chunks from ChromaDB (thread).
      3. Build adversarial system prompt (mirrors nodes.py L1983-2014).
      4. Stream final LLM response via astream().

    This route corresponds to the frontend "Critique This" button for one product.
    """
    retrieved_products = state.get("retrieved_products", [])
    product_names = [p.get("name") for p in retrieved_products if p.get("name")]
    category = state.get("constraints", {}).get("product_category", "product")

    # ── Phase 1: Forum harvest (blocking I/O + 3-second Gemini rate gaps) ─────
    yield _sse_status(f"📡 Harvesting community feedback for {product_name}…")

    try:
        vaulted_count = await asyncio.to_thread(
            _harvest_and_triage_forum_data,
            [product_name],
            category,
            _get_tavily(),
            _get_llm_base(),
        )
        yield _sse_status(f"✅ {vaulted_count} critique signals vaulted. Analysing…")
    except Exception as exc:
        logger.warning("Forum harvest error for %s: %s", product_name, exc)
        yield _sse_status(f"⚠️ Forum harvest encountered an issue: {exc}. Proceeding with cached data…")

    # ── Phase 2: Build advocate context (mirrors nodes.py L1894-1975) ─────────
    def _build_advocate_context():
        vs = _get_vectorstore()

        class _FakeDoc:
            def __init__(self, content: str, metadata: dict):
                self.page_content = content
                self.metadata     = metadata

        # Metadata-filtered pull across ALL products in session
        critique_docs = []
        for pname in product_names:
            try:
                result = vs.get(
                    where={
                        "$and": [
                            {"product_name": {"$eq": pname}},
                            {"chunk_type":   {"$eq": "forum_critique"}},
                        ]
                    }
                )
                if result and result.get("documents"):
                    for doc_text, meta in zip(result["documents"], result["metadatas"]):
                        critique_docs.append(_FakeDoc(doc_text, meta))
            except Exception:
                pass

        # Semantic similarity search scoped to forum_critique chunks
        try:
            expanded_q = f"{user_query} " + " ".join(product_names)
            sim_docs = vs.similarity_search(expanded_q, k=ADVOCATE_TOP_K)
            sim_critique = [d for d in sim_docs if d.metadata.get("chunk_type") == "forum_critique"]
        except Exception:
            sim_critique = []

        seen_contents = {d.page_content for d in critique_docs}
        for d in sim_critique:
            if d.page_content not in seen_contents:
                critique_docs.append(d)
                seen_contents.add(d.page_content)

        return critique_docs

    critique_docs = await asyncio.to_thread(_build_advocate_context)

    if not critique_docs:
        yield _sse_token(
            "👹 **Devil's Advocate**: No verified community complaints found in the vault. "
            "The product may have genuinely positive community sentiment, or try the "
            "Critique button again after a moment."
        )
        yield _sse_done()
        return

    # Count and sort (mirrors nodes.py L1948-1975)
    product_counts: Dict[str, int] = {}
    for d in critique_docs:
        pname = d.metadata.get("product_name", "Unknown")
        product_counts[pname] = product_counts.get(pname, 0) + 1

    total_discussions = len(critique_docs)

    sorted_docs = sorted(
        critique_docs,
        key=lambda d: d.metadata.get("severity_weight", 0),
        reverse=True,
    )

    context_parts = []
    for doc in sorted_docs:
        meta     = doc.metadata
        pname    = meta.get("product_name", "Unknown")
        severity = meta.get("severity_weight", "?")
        cls      = meta.get("classification", "")
        src_url  = meta.get("source_url", "Unknown")
        context_parts.append(
            f"Product: {pname} | Source: {src_url}\n"
            f"Severity: {severity}/5 | {cls}\n"
            f"{doc.page_content}"
        )
    context_block = "\n\n---\n\n".join(context_parts)

    # ── Phase 3: Build adversarial system prompt (mirrors nodes.py L1983-2014) ─
    models_str = ", ".join(product_names) if product_names else "(all products)"
    coverage_summary = "  ".join(
        f"{name}: {count} signal(s)" for name, count in product_counts.items()
    )

    from langchain_core.messages import SystemMessage
    system_prompt_text = (
        "You are a conversational, highly persuasive AI agent playing the Devil's Advocate. "
        "Your goal is to talk the user OUT of making a purchase by exposing verified real-world "
        "community bugs and flaws.\n\n"
        "DO NOT just output a dry, bulleted list of complaints. Converse with the user naturally. "
        "Weave the verified complaints into a flowing, narrative argument. Frame your sentences "
        "as if you are a concerned tech expert giving a friend an honest warning.\n\n"
        "CRITICAL NUMERICAL CITATION RULE: You must NEVER print the literal character "
        "letter 'N' inside the verification bracket. You must physically look at the "
        "matching context items provided below, count the exact number of independent "
        "threads or unique comment snippets backing that specific hardware defect, and "
        "output that real integer value. "
        "Example of correct format: '...and honestly, the thermal throttling is a "
        "dealbreaker. 🔴 [Sourced from 3 independent community reports - Severity Weight: 5/5] "
        "(reddit.com/r/Laptops). It essentially turns into a space heater...'. "
        "If an issue appears only once in the context data, output '1 independent community "
        "report'. The integer MUST reflect the actual count from the context — never a "
        "placeholder.\n\n"
        "SEVERITY FIRST: Lead your narrative with the highest-severity defects (Severity 4–5) "
        "and naturally flow down to lesser issues as the conversation continues.\n\n"
        "STRICT GROUNDING: Answer strictly using the provided context. Only discuss defects "
        "that appear in the retrieved context. Do NOT hallucinate or extrapolate beyond the data.\n\n"
        "NO HEDGING: Do not soften verified defects with marketing language or brand apologies. "
        "You are a concerned friend, not a PR spokesperson.\n\n"
        "PRODUCT SCOPE: Only discuss the products listed below. Do NOT introduce other models.\n\n"
        "ZERO DATA POLICY: If no complaints exist for a specific inquiry, converse naturally "
        "to state that the community hasn't reported issues regarding that yet — do not "
        "hallucinate data points.\n\n"
        f"Products under review: {models_str}\n"
        f"Total verified community signals in vault: {total_discussions}\n"
        f"Coverage per product: {coverage_summary}"
    )

    history = state.get("chat_history", [])
    recent_history = history[-4:] if history else []

    messages = (
        [SystemMessage(content=system_prompt_text)]
        + recent_history
        + [HumanMessage(content=(
            f"[FORUM CRITIQUE VAULT — {total_discussions} verified signals]\n\n"
            f"{context_block}\n\n"
            f"[USER QUESTION]\n{user_query}"
        ))]
    )

    # ── Phase 4: Stream advocate LLM response ─────────────────────────────────
    full_response = ""
    try:
        llm = _get_llm_base()
        async for chunk in llm.astream(messages):
            content = chunk.content
            if isinstance(content, list):
                content = "".join(
                    p if isinstance(p, str) else p.get("text", "")
                    for p in content
                )
            if content:
                full_response += content
                yield _sse_token(content)
    except Exception as exc:
        logger.exception("Advocate stream error for session %s", session_id)
        yield _sse_error(f"Advocate LLM stream error: {exc}")
        return

    # ── Persist advocate response to session history ───────────────────────────
    if full_response:
        state["chat_history"].append(HumanMessage(content=user_query))
        state["chat_history"].append(AIMessage(content=full_response))
    state["is_advocate_mode"] = True
    SessionStore[session_id] = state

    yield _sse_done({"is_advocate_mode": True, "product_critiqued": product_name})


# ═════════════════════════════════════════════════════════════════════════════
# ROUTES
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/health", tags=["System"])
async def health_check():
    """
    Liveness probe.

    Returns HTTP 200 with a JSON body so load balancers and frontend startup
    checks can confirm the API is reachable before showing the chat UI.
    """
    return {"status": "ok", "service": "Product Recommendation Agent API", "version": "3.0.0"}


@router.get(
    "/api/v1/session/{session_id}",
    response_model=SessionStateResponse,
    tags=["Session"],
)
async def get_session(session_id: str):
    """
    Retrieve the current state snapshot for a session.

    The frontend uses this endpoint to:
      • Determine whether to render the interview UI or the RAG chat UI
        (check `is_rag_mode`).
      • Populate the discovered products panel (read `retrieved_products`).
      • Show the user's current profile constraints.

    Returns 404 if the session has not yet been initialised (i.e., no chat
    request has been made for this ID yet).
    """
    if session_id not in SessionStore:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{session_id}' not found. Send a POST /api/v1/chat first.",
        )
    state = SessionStore[session_id]
    return SessionStateResponse(
        session_id=session_id,
        is_profile_complete=state.get("is_profile_complete", False),
        is_rag_mode=state.get("is_rag_mode", False),
        is_advocate_mode=state.get("is_advocate_mode", False),
        retrieved_products=state.get("retrieved_products", []),
        constraints=state.get("constraints", {}),
        message_count=len(state.get("chat_history", [])),
    )


@router.post("/api/v1/chat", tags=["Chat"])
@limiter.limit("20/minute")
async def chat(
    request: Request,
    body: ChatRequest,
    agent=Depends(get_agent_app),
    embeddings=Depends(get_embeddings),
):
    """
    Primary interaction endpoint — streams tokens via Server-Sent Events.

    The client opens this as an EventSource (or uses fetch + ReadableStream).
    The route automatically routes between:

      **Interview phase** (`is_rag_mode == False`):
        Runs the LangGraph interview graph (analyzer → question generator or
        vault search).  Emits every token the LLM generates in real-time via
        astream_events().

      **RAG chat phase** (`is_rag_mode == True`):
        Retrieves ChromaDB vault context (async thread), builds the exact same
        message chain as comparison_agent_node, and streams the LLM response
        token-by-token via astream().

    SSE event types the client should handle:
      • `message` with `{"type": "token",  "content": "<text>"}` — append to display buffer
      • `status`  with `{"type": "status", "message": "<text>"}` — show progress toast
      • `message` with `{"type": "done",   ...metadata}`         — finalise display
      • `error`   with `{"type": "error",  "message": "<text>"}` — show error toast
    """
    session_id = body.session_id
    user_message = body.message.strip()

    # ── Initialise or retrieve session ────────────────────────────────────────
    state = get_or_create_session(session_id)

    # ── Append the user's message to history ──────────────────────────────────
    state["chat_history"].append(HumanMessage(content=user_message))

    # ── Route to correct phase ────────────────────────────────────────────────
    if state.get("is_rag_mode", False):
        # RAG chat — stream vault-grounded comparison/spec answer
        generator = _stream_rag_phase(
            session_id=session_id,
            state=state,
            user_query=user_message,
            embeddings=embeddings,
        )
    else:
        # Interview phase — stream LangGraph interview graph
        generator = _stream_interview_phase(
            session_id=session_id,
            state=state,
            agent=agent,
        )

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            # Prevent Nginx/proxies from buffering the SSE stream
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


@router.post("/api/v1/advocate", tags=["Advocate"])
@limiter.limit("20/minute")
async def advocate(
    request: Request,
    body: AdvocateRequest,
):
    """
    Devil's Advocate critique endpoint — streams an adversarial analysis via SSE.

    Corresponds to the frontend "Critique This" button for a specific product.

    Pipeline (all streamed):
      1. Runs `_harvest_and_triage_forum_data` in a background thread
         (preserves the 3-second sequential rate-limit gap between Gemini calls).
      2. Retrieves verified community critique chunks from ChromaDB.
      3. Streams the adversarial LLM narrative response token-by-token.

    Requires an existing session that has completed the interview phase
    (`is_rag_mode == True`).  Returns 400 if the session is still in the
    interview phase or 404 if it doesn't exist.
    """
    session_id   = body.session_id
    product_name = body.product_name.strip()

    if session_id not in SessionStore:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{session_id}' not found. Complete the interview phase first.",
        )

    state = SessionStore[session_id]

    if not state.get("is_rag_mode", False):
        raise HTTPException(
            status_code=400,
            detail=(
                "Session has not completed the interview phase yet. "
                "The product vault must be populated before running Devil's Advocate."
            ),
        )

    # Use the product_name as the user query for context
    user_query = f"What are the real problems with the {product_name}?"

    generator = _stream_advocate_phase(
        session_id=session_id,
        state=state,
        product_name=product_name,
        user_query=user_query,
    )

    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )
