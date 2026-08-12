"""app/rag.py -- knowledge base grounding for the chat engine.

V1: the KB is a handful of short markdown files, so this loads all of them
in full and hands them to the chat engine as grounding context. No
embeddings, no vector search -- that's only worth building once the KB is
too large to fit in context, not before.
"""
from app.config import settings


def load_kb() -> str:
    """Read every .md file in settings.KB_DIR and concatenate them into
    one grounding block, each clearly labeled with its source filename."""
    if not settings.KB_DIR.is_dir():
        return ""

    sections = []
    for path in sorted(settings.KB_DIR.glob("*.md")):
        content = path.read_text(encoding="utf-8")
        sections.append(f"### Source: {path.name}\n{content}")

    return "\n\n".join(sections)