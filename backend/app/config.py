"""app/config.py -- centralized settings, loaded once from .env.

Every other module imports `settings` from here rather than reading
os.environ directly, so there's exactly one place that knows about env
var names and defaults.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
KB_DIR = BASE_DIR / "kb"


class Settings:
    # -- Gemini API --
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

    CHAT_MODEL: str = os.getenv("CHAT_MODEL", "gemini-2.5-flash")
    STT_MODEL: str = os.getenv("STT_MODEL", "gemini-2.5-flash")
    TTS_MODEL: str = os.getenv("TTS_MODEL", "gemini-2.5-flash-preview-tts")
    TTS_VOICE: str = os.getenv("TTS_VOICE", "Aoede")

    # -- Knowledge base --
    KB_DIR: Path = KB_DIR

    # -- Server --
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # -- Audio --
    AUDIO_SAMPLE_RATE: int = 8000  # every transport in this project uses 8kHz/16-bit/mono PCM

    # -- Twilio (phone) integration -- optional, unset until a real Twilio
    # account/number is configured. See app/integrations/twilio_voice.py.
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_PHONE_NUMBER: str = os.getenv("TWILIO_PHONE_NUMBER", "")
    # Publicly reachable base URL (e.g. an ngrok tunnel in dev) Twilio uses
    # to reach the /twilio/voice webhook and /twilio/media-stream websocket.
    PUBLIC_BASE_URL: str = os.getenv("PUBLIC_BASE_URL", "")

    # -- WhatsApp Business (Meta Cloud API) integration -- optional, unset
    # until a real Meta app/number is configured. See
    # app/integrations/whatsapp.py.
    WHATSAPP_ACCESS_TOKEN: str = os.getenv("WHATSAPP_ACCESS_TOKEN", "")
    WHATSAPP_PHONE_NUMBER_ID: str = os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
    WHATSAPP_VERIFY_TOKEN: str = os.getenv("WHATSAPP_VERIFY_TOKEN", "")

    @property
    def twilio_configured(self) -> bool:
        return bool(self.TWILIO_ACCOUNT_SID and self.TWILIO_AUTH_TOKEN and self.PUBLIC_BASE_URL)

    @property
    def whatsapp_configured(self) -> bool:
        return bool(self.WHATSAPP_ACCESS_TOKEN and self.WHATSAPP_PHONE_NUMBER_ID)


settings = Settings()

if not settings.GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is not set. Copy .env.example to .env and add your key."
    )