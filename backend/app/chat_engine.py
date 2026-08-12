"""app/chat_engine.py -- multi-turn conversation engine for the voice
assistant. Grounds every reply on the KB via rag.load_kb() and builds its
system instruction from the prompt registry, so neither the KB content nor
the persona wording is hardcoded here.
"""
from google import genai
from google.genai import types

from app.config import settings
from app.personas import DEFAULT_PERSONA_KEY, get_persona
from app.prompts.prompt_manager import prompt_manager
from app.rag import load_kb

_client = genai.Client(api_key=settings.GEMINI_API_KEY)


class ChatEngine:
    """One instance per call/session -- holds that session's conversation
    history. Create a new instance per call rather than reusing one across
    callers.

    persona selects which prompt template grounds this session (see
    app/personas.py) -- defaults to the sales persona, the only one
    implemented so far. Callers should validate persona.available before
    constructing this."""

    def __init__(self, persona: str = DEFAULT_PERSONA_KEY):
        resolved = get_persona(persona)
        if resolved is None or not resolved.available or resolved.prompt_key is None:
            raise ValueError(f"Persona '{persona}' is not available")

        kb_context = load_kb()
        self.system_instruction = prompt_manager.get_prompt(
            resolved.prompt_key, kb_context=kb_context
        )
        self.history: list[types.Content] = []

    def generate_reply(self, user_text: str) -> str:
        self.history.append(
            types.Content(role="user", parts=[types.Part(text=user_text)])
        )

        response = _client.models.generate_content(
            model=settings.CHAT_MODEL,
            contents=self.history,
            config=types.GenerateContentConfig(
                system_instruction=self.system_instruction,
            ),
        )
        reply_text = (response.text or "").strip()

        self.history.append(
            types.Content(role="model", parts=[types.Part(text=reply_text)])
        )
        return reply_text