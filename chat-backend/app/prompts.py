"""Grounded prompt assembly for the RAG chat.

Turns a user question plus the retrieved corpus chunks into the message list
sent to the chat LLM. The system prompt is the guardrail: answer ONLY from the
provided context (Mikko's own portfolio content), never invent, and when the
context is empty or irrelevant say so plainly rather than hallucinate. Phase 4
hardens this with retrieval-strength gating; the instruction lives here from the
start so the model is grounded even before that.

Pure and stdlib-only, so the exact prompt shape is unit-tested.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

# The English-only rule is split out so it can be dropped when FORCE_ENGLISH is
# off (then the model may answer in the question's language). Kept forceful
# because small models obey a lone system rule unreliably — it is reinforced by
# an in-message directive (see build_messages).
_ENGLISH_SYSTEM_RULE = (
    "- You MUST write your ENTIRE reply in English. Even if the question is in "
    "Finnish or any other language, do not answer in that language — answer "
    "only in English.\n"
)

_SYSTEM_PROMPT_HEAD = (
    "You are the assistant on Mikko Numminen's developer portfolio terminal. "
    "Answer questions about Mikko, his projects, CV, and posts using ONLY the "
    "context below — it is excerpts from his own content.\n"
    "Rules:\n"
)

_SYSTEM_PROMPT_RULES = (
    "- Ground every claim in the context. Never invent projects, numbers, "
    "dates, tech, or features that are not there.\n"
    "- Keep it SHORT — a few sentences, a short paragraph at most. Be specific "
    "(name the relevant projects and what they do) but brief. NEVER reproduce a "
    "whole document or paste large code blocks; summarise in your own words. If "
    "the user wants more detail, they will ask.\n"
    "- When asked HOW something was built, or about a specific problem, "
    "mechanism, or decision, answer THAT exact thing with the concrete "
    "technical approach — the actual mechanism, not a related-but-different "
    "one. If the context describes several mechanisms, pick the one the "
    "question is actually about.\n"
    "- The excerpts are only a SLICE of Mikko's work. Do NOT claim a project, "
    "technology, or feature is absent just because it isn't spelled out, and "
    "don't refuse over a vocabulary mismatch — the user may use their own words "
    "for his tech (e.g. 'the Microsoft stack' for his .NET / C# / ASP.NET Core / "
    "Azure work). Map their wording to the matching projects and answer with what "
    "fits; only say you're not certain when nothing relevant is there.\n"
    "- If the exact thing asked is not spelled out, do NOT dead-end. Answer "
    "with the most relevant facts you do have and say plainly what the context "
    "doesn't cover (e.g. 'the content doesn't rank them by size, but ...'). "
    "Only when nothing in the context is relevant at all, say you don't have "
    "anything on that yet.\n"
    "- Never tell the user to type `help` or run a command — just answer.\n"
    "- Factual, friendly terminal voice. Write plain text with NO markdown — no "
    "asterisks or bold, no headings, no backticks, no code fences. The terminal "
    "renders raw text, so any markup shows as literal characters.\n"
    "- Refer to Mikko in the third person."
)

# Prepended to the user turn — the last thing the model reads before it answers
# — when FORCE_ENGLISH is on. An instruction in the user message is far more
# reliable than the system rule alone for keeping small models in English.
_ENGLISH_USER_DIRECTIVE = (
    "Respond ONLY in English, regardless of the language of the question.\n\n"
)


def build_system_prompt(force_english: bool) -> str:
    """The system prompt, carrying the English-only rule only when forced."""
    english = _ENGLISH_SYSTEM_RULE if force_english else ""
    return f"{_SYSTEM_PROMPT_HEAD}{english}{_SYSTEM_PROMPT_RULES}"


# Canonical (English-forced) system prompt. Exposed as a module constant for
# callers/tests that reference the default shape.
SYSTEM_PROMPT = build_system_prompt(force_english=True)


@dataclass(frozen=True)
class ContextChunk:
    """A retrieved corpus excerpt to ground the answer in."""

    source: str
    title: str
    content: str
    project: str | None = None


def format_context(chunks: Sequence[ContextChunk]) -> str:
    """Render retrieved chunks as a numbered, source-labelled context block."""
    if not chunks:
        return "(no relevant content found)"
    blocks = []
    for i, chunk in enumerate(chunks, start=1):
        label = chunk.title or chunk.source
        blocks.append(f"[{i}] {label} ({chunk.source})\n{chunk.content}")
    return "\n\n".join(blocks)


def build_messages(
    query: str,
    chunks: Sequence[ContextChunk],
    history: Sequence[Mapping[str, str]] = (),
    force_english: bool = True,
) -> list[dict[str, str]]:
    """Assemble the OpenAI-style message list: system, prior turns, grounded ask.

    `history` (optional, role/content pairs) is threaded between the system
    instruction and the final grounded question so multi-turn callers keep
    context; the single-turn terminal passes none.

    When `force_english` is on, the system prompt carries the English-only rule
    AND the final user turn is prefixed with an explicit English directive — a
    belt-and-braces pair, because small models honour a lone system rule
    unreliably. When off, neither is added and the model may reply in the
    question's language.
    """
    system = build_system_prompt(force_english)
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    for turn in history:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})
    context = format_context(chunks)
    user_content = f"Context:\n{context}\n\nQuestion: {query}"
    if force_english:
        user_content = _ENGLISH_USER_DIRECTIVE + user_content
    messages.append({"role": "user", "content": user_content})
    return messages
