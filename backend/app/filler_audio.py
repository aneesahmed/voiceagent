"""app/filler_audio.py -- short "please hold on" lines played while
process_turn works through transcription + reply generation + synthesis
(the ~1-3s gap the Integrations panel already documents as normal). Each
phrase is synthesized once and cached in memory so playing a filler never
adds its own TTS latency to a turn -- warm_cache() pre-synthesizes all of
them at server startup so even the very first call doesn't pay that cost.
"""
import logging
import random

from app.tts import synthesize

logger = logging.getLogger(__name__)

_PHRASES = [
    "One moment, let me check that for you.",
    "Sure, give me just a second.",
    "Let me look that up for you.",
]

_cache: dict[str, bytes] = {}


def warm_cache() -> None:
    """Synthesizes every filler phrase up front. Safe to call more than
    once -- already-cached phrases are skipped."""
    for phrase in _PHRASES:
        if phrase not in _cache:
            _cache[phrase] = synthesize(phrase)
    logger.info("filler audio cache warmed (%d phrases)", len(_cache))


def get_filler_audio() -> bytes:
    """Returns PCM audio (project's canonical 8kHz/16-bit/mono, since it
    comes straight out of tts.synthesize) for a random filler phrase,
    synthesizing and caching it on first use if warm_cache() wasn't
    called yet."""
    phrase = random.choice(_PHRASES)
    if phrase not in _cache:
        _cache[phrase] = synthesize(phrase)
    return _cache[phrase]
