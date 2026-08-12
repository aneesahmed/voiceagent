"""app/stt.py -- Gemini speech-to-text.

Takes raw 8kHz/16-bit/mono PCM (what the web transport captures from the
browser mic) and returns a plain transcript string.
"""
import io
import wave

from google import genai
from google.genai import types

from app.config import settings

_client = genai.Client(api_key=settings.GEMINI_API_KEY)


def transcribe(pcm_bytes: bytes) -> str:
    """Wraps raw PCM in an in-memory WAV header, then asks Gemini to
    transcribe it. Returns an empty string for silence/no speech."""
    if not pcm_bytes:
        return ""

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(settings.AUDIO_SAMPLE_RATE)
        wf.writeframes(pcm_bytes)
    wav_bytes = buffer.getvalue()

    response = _client.models.generate_content(
        model=settings.STT_MODEL,
        contents=[
            types.Part.from_bytes(data=wav_bytes, mime_type="audio/wav"),
            "Transcribe exactly what the speaker said. "
            "Reply with only the transcript text, nothing else. "
            "If there is no clear speech, reply with an empty string.",
        ],
    )
    return (response.text or "").strip()