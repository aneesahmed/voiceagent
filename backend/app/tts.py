"""app/tts.py -- Gemini text-to-speech.

Gemini TTS returns 24kHz PCM; every transport in this project (web pseudo-
call today, others later) expects 8kHz/16-bit/mono, so this resamples
before handing audio back.
"""
import struct

from google import genai
from google.genai import types

from app.config import settings

_client = genai.Client(api_key=settings.GEMINI_API_KEY)


def _resample_24k_to_8k(pcm16_bytes: bytes) -> bytes:
    """Gemini TTS returns 24kHz PCM; exact 3:1 ratio down to 8kHz, so a
    simple averaging decimation is enough -- no resampling library needed."""
    n = len(pcm16_bytes) // 2
    samples = struct.unpack(f"<{n}h", pcm16_bytes[: n * 2])
    out = []
    for i in range(0, n - n % 3, 3):
        out.append((samples[i] + samples[i + 1] + samples[i + 2]) // 3)
    return struct.pack(f"<{len(out)}h", *out)


def synthesize(text: str) -> bytes:
    """Gemini TTS -> raw 8kHz/16-bit/mono PCM bytes, ready to stream
    straight over the websocket to the browser."""
    response = _client.models.generate_content(
        model=settings.TTS_MODEL,
        contents=text,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=settings.TTS_VOICE
                    )
                )
            ),
        ),
    )
    pcm_24k = response.candidates[0].content.parts[0].inline_data.data
    return _resample_24k_to_8k(pcm_24k)