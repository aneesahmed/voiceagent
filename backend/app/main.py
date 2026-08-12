"""app/main.py -- FastAPI app: HTTP endpoints for text-only testing, plus
the /audio websocket for real-time voice.

Endpoints:
    GET  /health   -- liveness check
    POST /chat     -- text-only chat, for testing chat_engine.py without
                      needing audio or a browser at all
    WS   /audio    -- real-time voice: client streams raw PCM16 frames
                      continuously (even while the assistant is replying,
                      to support barge-in), sends
                      {"event": "end_of_turn"} when done speaking. Server
                      first streams a short cached filler line (PCM16
                      frames wrapped in {"event": "filler_start"} /
                      {"event": "filler_end"}) while it works, then
                      streams the real reply (PCM16 frames followed by
                      {"event": "reply_end"}), or {"event": "interrupted"}
                      if the caller barged in at any point.
"""
import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.call_engine import process_turn
from app.chat_engine import ChatEngine
from app.filler_audio import warm_cache as warm_filler_cache
from app.integrations import twilio_voice, whatsapp
from app.kb_routes import router as kb_router
from app.personas import DEFAULT_PERSONA_KEY, PERSONA_REGISTRY, get_persona

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("warming filler audio cache...")
    await asyncio.to_thread(warm_filler_cache)
    yield


app = FastAPI(title="Meridian ERP Voice Assistant", lifespan=lifespan)

# Frontend runs on a different port during dev (Vite default 5173) -- allow it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to the real frontend origin before production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


# --- persona registry, for the frontend's persona-picker landing page ---

class PersonaOut(BaseModel):
    key: str
    label: str
    description: str
    available: bool


@app.get("/personas", response_model=list[PersonaOut])
async def personas():
    return [
        PersonaOut(key=p.key, label=p.label, description=p.description, available=p.available)
        for p in PERSONA_REGISTRY.values()
    ]


# --- text-only chat endpoint, for testing the engine without audio ---

class ChatRequest(BaseModel):
    message: str
    persona: str = DEFAULT_PERSONA_KEY


class ChatResponse(BaseModel):
    reply: str


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """Fresh ChatEngine per request -- no multi-turn memory over plain
    HTTP yet. Good enough for testing single-turn KB grounding before the
    UI exists; /audio below keeps real per-call session memory."""
    persona = get_persona(req.persona)
    if persona is None or not persona.available:
        raise HTTPException(status_code=400, detail=f"Persona '{req.persona}' is not available")

    engine = ChatEngine(persona=req.persona)
    reply = engine.generate_reply(req.message)
    return ChatResponse(reply=reply)


# --- real-time voice websocket ---

app.include_router(kb_router)
app.include_router(twilio_voice.router)
app.include_router(whatsapp.router)


@app.websocket("/audio")
async def audio_ws(ws: WebSocket):
    await ws.accept()
    call_id = id(ws)

    persona_key = ws.query_params.get("persona", DEFAULT_PERSONA_KEY)
    persona = get_persona(persona_key)
    if persona is None or not persona.available:
        logger.info("[%s] rejecting call: persona '%s' is not available", call_id, persona_key)
        await ws.send_text(json.dumps({"event": "error", "message": f"Persona '{persona_key}' is not available"}))
        await ws.close(code=4004)
        return

    engine = ChatEngine(persona=persona_key)
    audio_buffer = bytearray()
    interrupt_event = asyncio.Event()
    turn_task: asyncio.Task | None = None

    logger.info("[%s] call connected (persona=%s)", call_id, persona_key)

    async def send_frame(data: bytes) -> None:
        await ws.send_bytes(data)

    async def send_event(event: dict) -> None:
        await ws.send_text(json.dumps(event))

    try:
        while True:
            message = await ws.receive()

            if message["type"] == "websocket.disconnect":
                logger.info("[%s] client disconnected (code=%s)", call_id, message.get("code"))
                break

            if message.get("bytes") is not None:
                audio_buffer += message["bytes"]

                if turn_task is not None and not turn_task.done():
                    if not interrupt_event.is_set():
                        interrupt_event.set()
                        logger.info("[%s] barge-in detected, interrupting current turn", call_id)
                continue

            if message.get("text") is not None:
                try:
                    event = json.loads(message["text"])
                except json.JSONDecodeError:
                    logger.warning("[%s] received malformed text frame: %r", call_id, message["text"])
                    continue

                logger.info("[%s] event received: %s", call_id, event)

                if event.get("event") == "end_of_turn":
                    if turn_task is not None and not turn_task.done():
                        logger.info("[%s] end_of_turn ignored, a turn is already in progress", call_id)
                        continue

                    if not audio_buffer:
                        logger.info("[%s] end_of_turn with no buffered audio, ignoring", call_id)
                        continue

                    audio_to_process = bytes(audio_buffer)
                    audio_buffer.clear()
                    interrupt_event = asyncio.Event()
                    turn_task = asyncio.create_task(
                        process_turn(
                            engine=engine,
                            call_id=call_id,
                            audio_bytes=audio_to_process,
                            interrupt_event=interrupt_event,
                            send_frame=send_frame,
                            send_event=send_event,
                        )
                    )

    except WebSocketDisconnect:
        logger.info("[%s] call disconnected", call_id)
    finally:
        if turn_task is not None and not turn_task.done():
            turn_task.cancel()
        logger.info("[%s] call ended", call_id)
