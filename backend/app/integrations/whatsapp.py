"""app/integrations/whatsapp.py -- WhatsApp Business (Meta Cloud API)
integration. Text-based: reuses ChatEngine.generate_reply directly, no
STT/TTS involved.

We deliberately do NOT drive the real WhatsApp Web UI via browser
automation (e.g. Playwright) -- that's not an official API, breaks
WhatsApp's Terms of Service, risks the number being banned, and breaks
every time Meta changes the web UI. The Cloud API below is the supported,
production-safe path and is what this integration uses.

NOT CONFIGURED YET (per project decision -- see settings.whatsapp_configured):
this needs a Meta developer app with the WhatsApp product added, a phone
number registered on the Cloud API, and this webhook
(POST {PUBLIC_BASE_URL}/whatsapp/webhook) registered + verified in the
Meta App Dashboard using WHATSAPP_VERIFY_TOKEN. See the frontend's
Integrations panel for the exact setup steps.
"""
import logging

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from app.chat_engine import ChatEngine
from app.config import settings
from app.personas import DEFAULT_PERSONA_KEY

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"

# One ChatEngine per WhatsApp sender, kept for the process's lifetime --
# same "one session per caller" model as /audio, just keyed by phone
# number instead of by websocket connection. Lost on restart; fine for
# now, same as every other in-memory session in this project.
_sessions: dict[str, ChatEngine] = {}


@router.get("/webhook")
async def verify_webhook(
    hub_mode: str = Query(alias="hub.mode", default=""),
    hub_verify_token: str = Query(alias="hub.verify_token", default=""),
    hub_challenge: str = Query(alias="hub.challenge", default=""),
):
    """Meta calls this once, at setup time, to confirm you control the
    webhook URL -- must echo hub.challenge back if the token matches."""
    if hub_mode == "subscribe" and hub_verify_token and hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Verification token mismatch")


@router.post("/webhook")
async def receive_message(request: Request):
    if not settings.whatsapp_configured:
        logger.warning("WhatsApp webhook hit but WHATSAPP_* settings are not configured")
        return {"status": "ignored"}

    payload = await request.json()
    logger.info("whatsapp webhook payload received")

    try:
        entry = payload["entry"][0]["changes"][0]["value"]
        messages = entry.get("messages", [])
    except (KeyError, IndexError):
        return {"status": "ignored"}

    for message in messages:
        sender = message["from"]
        text = message.get("text", {}).get("body")
        if not text:
            logger.info("[whatsapp:%s] non-text message ignored (type=%s)", sender, message.get("type"))
            continue

        logger.info("[whatsapp:%s] received: %r", sender, text)
        engine = _sessions.setdefault(sender, ChatEngine(persona=DEFAULT_PERSONA_KEY))
        reply = engine.generate_reply(text)
        logger.info("[whatsapp:%s] reply: %r", sender, reply)
        await _send_message(sender, reply)

    return {"status": "ok"}


async def _send_message(to: str, text: str) -> None:
    url = f"{GRAPH_API_BASE}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {"Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}"}
    body = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "text",
        "text": {"body": text},
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=body)
        if response.status_code >= 400:
            logger.error("whatsapp send failed (%s): %s", response.status_code, response.text)
