"""app/kb_routes.py -- view/update the knowledge base markdown files that
ground the AI Sales Agent's replies (see app/rag.py), so the RAG context
can be reviewed and edited from the UI instead of by hand on disk.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings

router = APIRouter(prefix="/kb", tags=["kb"])


class KBDocument(BaseModel):
    filename: str
    content: str


class KBUpdateRequest(BaseModel):
    content: str


def _resolve_kb_path(filename: str):
    """Only allows *.md files directly inside KB_DIR -- rejects anything
    that would escape it (path traversal, subdirectories, symlinks out)."""
    if not filename.endswith(".md") or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    kb_dir = settings.KB_DIR.resolve()
    path = (settings.KB_DIR / filename).resolve()
    if path.parent != kb_dir or not path.is_file():
        raise HTTPException(status_code=404, detail="Document not found")
    return path


@router.get("", response_model=list[KBDocument])
async def list_kb_documents():
    return [
        KBDocument(filename=path.name, content=path.read_text(encoding="utf-8"))
        for path in sorted(settings.KB_DIR.glob("*.md"))
    ]


@router.put("/{filename}", response_model=KBDocument)
async def update_kb_document(filename: str, req: KBUpdateRequest):
    path = _resolve_kb_path(filename)
    path.write_text(req.content, encoding="utf-8")
    return KBDocument(filename=path.name, content=req.content)
