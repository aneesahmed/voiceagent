"""app/call_engine.py -- transport-agnostic turn processing, shared by
every voice channel (browser /audio websocket, Twilio phone calls, and any
future channel). Every transport converts its own wire format at the
boundary and calls process_turn with plain 8kHz/16-bit/mono PCM -- this
project's canonical audio contract (see CLAUDE.md decision #6) -- plus two
callables: send_frame for outgoing audio and send_event for out-of-band
signaling (reply_end/interrupted/error). A transport that has no concept
of those events (e.g. Twilio) can make send_event a no-op/log call.
"""
import asyncio
import logging
from typing import Awaitable, Callable

from app.chat_engine import ChatEngine
from app.filler_audio import get_filler_audio
from app.stt import transcribe
from app.tts import synthesize

logger = logging.getLogger(__name__)

FRAME_SIZE = 640  # 320 samples * 2 bytes = 40ms @ 8kHz

SendFrame = Callable[[bytes], Awaitable[None]]
SendEvent = Callable[[dict], Awaitable[None]]


async def _stream_audio(audio_bytes: bytes, send_frame: SendFrame, interrupt_event: asyncio.Event) -> bool:
    """Streams pre-synthesized PCM audio out in FRAME_SIZE chunks, checking
    interrupt_event and yielding between every frame -- same pattern used
    for both the filler line and the real reply. Returns False (and stops
    early, mid-frame) if interrupted."""
    for i in range(0, len(audio_bytes), FRAME_SIZE):
        if interrupt_event.is_set():
            return False
        await send_frame(audio_bytes[i : i + FRAME_SIZE])
        await asyncio.sleep(0)
    return True


async def process_turn(
    *,
    engine: ChatEngine,
    call_id: object,
    audio_bytes: bytes,
    interrupt_event: asyncio.Event,
    send_frame: SendFrame,
    send_event: SendEvent,
) -> None:
    """Runs one caller turn (transcribe -> reply -> synthesize -> stream)
    as its own task, concurrently with the transport's receive loop, so
    the loop stays free to notice barge-in audio and set interrupt_event.
    Checked before each expensive stage and between every streamed frame,
    so an interrupt lands within one 40ms frame instead of waiting for the
    whole reply."""
    try:
        logger.info("[%s] transcribing %d bytes of audio", call_id, len(audio_bytes))
        heard = await asyncio.to_thread(transcribe, audio_bytes)
        logger.info("[%s] caller said: %r", call_id, heard)

        if not heard:
            logger.info("[%s] empty transcript, skipping reply", call_id)
            return

        if interrupt_event.is_set():
            logger.info("[%s] interrupted before filler/reply generation", call_id)
            return

        # Play a cached "one moment..." line while the slow parts (LLM
        # reply + speech synthesis) run, so the caller hears something
        # within a frame or two instead of dead air for 1-3s.
        filler_audio = get_filler_audio()
        logger.info("[%s] streaming filler audio (%d bytes)", call_id, len(filler_audio))
        await send_event({"event": "filler_start"})
        if not await _stream_audio(filler_audio, send_frame, interrupt_event):
            logger.info("[%s] interrupted during filler audio", call_id)
            await send_event({"event": "interrupted"})
            return
        await send_event({"event": "filler_end"})

        if interrupt_event.is_set():
            logger.info("[%s] interrupted before synthesis", call_id)
            return

        reply_text = await asyncio.to_thread(engine.generate_reply, heard)
        logger.info("[%s] agent reply: %r", call_id, reply_text)

        if interrupt_event.is_set():
            logger.info("[%s] interrupted before synthesis", call_id)
            return

        reply_audio = await asyncio.to_thread(synthesize, reply_text)
        logger.info("[%s] synthesized %d bytes of reply audio", call_id, len(reply_audio))

        if not await _stream_audio(reply_audio, send_frame, interrupt_event):
            logger.info("[%s] interrupted mid-reply-stream", call_id)
            await send_event({"event": "interrupted"})
            return

        logger.info("[%s] reply stream complete", call_id)
        await send_event({"event": "reply_end"})

    except Exception:
        logger.exception("[%s] error while processing turn", call_id)
        try:
            await send_event({"event": "error", "message": "internal error"})
        except Exception:
            pass
