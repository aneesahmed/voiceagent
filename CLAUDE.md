# Meridian ERP Voice Assistant -- Project Context

This file is for Claude Code. Read it before making changes. It captures
decisions already made so they aren't re-litigated, and the exact current
state so work continues rather than restarts.

## What this project is

A voice assistant platform, launched with one persona/workflow --
**AI Sales Agent** for a fictional company, **Meridian ERP Inc.**
(Canadian cloud ERP vendor, SME-focused), grounded on a small markdown
knowledge base. Users reach it through a web page: pick a persona, click
"Start Call," speak into the mic, the assistant transcribes, generates a
grounded reply, and speaks it back -- a browser-based pseudo phone call.

The product roadmap has 15 planned personas/features (AI Sales Agent, AI
Customer Support Agent, Knowledge Base Integration, CRM Integration,
Appointment Scheduling, Lead Capture, Analytics Dashboard, Admin Portal,
Multi-channel Messaging, Voice AI, Conversation Logs, Reporting Dashboard,
Human Escalation, API Integrations, Documentation/Training). They're built
**one at a time**; the persona picker UI shows all 15 but only implemented
ones are selectable. The full list lives in `backend/app/personas.py`, not
duplicated in this file -- check there for current status.

The assistant is also reachable over real channels now, not just the
browser: a real phone call via **Twilio** (Media Streams) and **WhatsApp**
(Business Cloud API) both route into the same conversation engine as the
browser call. Both are functional but **unconfigured by default** --
no credentials are set up yet (see "Environment / config"). WhatsApp Web
browser-automation (e.g. via Playwright) was considered and explicitly
rejected -- see decision #15.

## Repo layout

```
voiceagent/
├── backend/              # FastAPI, Python, managed by uv (NOT the repo root)
│   ├── app/
│   │   ├── main.py           # FastAPI app: /health, /chat, /audio, /personas, includes kb/twilio/whatsapp routers
│   │   ├── config.py         # Settings, loaded from .env
│   │   ├── personas.py       # PERSONA_REGISTRY -- the 15-item roadmap list + which are available
│   │   ├── chat_engine.py    # ChatEngine class -- multi-turn conversation, one instance per call, persona-aware
│   │   ├── call_engine.py    # process_turn() -- transport-agnostic turn logic shared by /audio and Twilio
│   │   ├── rag.py            # load_kb() -- naive full-KB-in-context grounding
│   │   ├── stt.py            # Gemini speech-to-text: transcribe(pcm_bytes) -> str
│   │   ├── tts.py            # Gemini text-to-speech: synthesize(text) -> pcm_bytes
│   │   ├── kb_routes.py       # GET/PUT /kb -- view+edit the KB markdown files from the UI
│   │   ├── integrations/
│   │   │   ├── twilio_voice.py   # /twilio/voice (TwiML) + /twilio/media-stream (websocket), mu-law codec
│   │   │   └── whatsapp.py       # /whatsapp/webhook -- Meta Cloud API, text-based
│   │   └── prompts/
│   │       ├── prompt_manager.py       # PromptManager registry (see "Prompt management" below)
│   │       └── templates/
│   │           └── meridian_assistant.yaml
│   ├── kb/                   # the knowledge base -- 4 markdown files, real content, editable via /kb
│   │   ├── company_profile.md
│   │   ├── pricing_and_plans.md
│   │   ├── faq.md
│   │   └── policies.md
│   ├── pyproject.toml        # uv-managed, dependencies for backend ONLY
│   ├── .env                  # real GEMINI_API_KEY + optional Twilio/WhatsApp keys go here (gitignored)
│   └── .env.example
│
├── frontend/              # Vite + React + TypeScript, managed by npm
│   └── src/
│       ├── types.ts           # CallStatus, Persona, adapter callback signatures
│       ├── CallAdapter.ts     # WebSocket audio transport, barge-in, silence detection, filler playback
│       ├── App.tsx            # single-page 3-column layout: KBPanel | call UI | IntegrationsPanel (no tabs)
│       ├── PersonaPicker.tsx  # landing page (center column) -- fetches /personas, only available ones clickable
│       ├── CallScreen.tsx     # the actual call UI (mic meter, log, Start/End Call, "I'm Done Talking"), persona-scoped
│       ├── KBPanel.tsx        # left sidebar -- scrollable collapsible tiles, view/edit KB files (GET/PUT /kb)
│       ├── IntegrationsPanel.tsx  # right sidebar -- collapsible tiles: call flow, Twilio setup, WhatsApp setup
│       └── main.tsx           # entry point
│
└── README.md
```

## Architecture decisions already made (do not redesign these without being asked)

1. **No multi-agent "factory" pattern.** An earlier design pass explored a
   `agent-factory/` structure with `components/` + `products/` +
   `persona.yaml` configs, meant to support many future agent types
   (sales, support, teaching, document-summarizer, etc.) built from shared
   components. **This was deliberately abandoned as overengineered** for a
   project that currently has exactly one agent. Do not reintroduce it
   unless explicitly asked.
   **Update:** a multi-persona roadmap is now real (see decision #12) --
   that does NOT reverse this decision. The persona registry is one flat
   dict (`app/personas.py`) plus one extra `persona` parameter threaded
   through the existing single-endpoint code path -- not a new
   `components/`+`products/` abstraction layer, not per-persona endpoint
   duplication. If a persona ever needs genuinely different *logic* (not
   just a different prompt/KB), that's the point to revisit this decision
   deliberately -- don't back into a factory pattern by accretion.

2. **`app/` not `src/` for the backend package name.** Matches FastAPI's
   own convention; this is a single deployable app, not a distributable
   library, so `src/`-layout's main benefit (avoiding accidental local
   imports of unpackaged code) doesn't apply here.

3. **Two fully independent toolchains, not one.** `backend/` has its own
   `pyproject.toml` and is `uv`-managed. `frontend/` has its own
   `package.json` and is `npm`-managed. Neither toolchain's root is the
   repo root (`voiceagent/`) -- each lives inside its own subfolder. If
   `uv` ever reports picking up a "workspace" unexpectedly, check for a
   stray `pyproject.toml` one level up.

4. **Prompt management: registry pattern, not hardcoded strings or plain
   `.md`.** `app/prompts/templates/*.yaml` holds prompt content (with
   `description:` + `template:` keys), loaded by
   `app/prompts/prompt_manager.py`'s `PromptManager` class into an
   in-memory registry, retrieved via
   `prompt_manager.get_prompt(key, **kwargs)` with `.format()`-style
   variable interpolation (e.g. `{kb_context}`). Chosen over plain
   hardcoded prompt strings because it supports variable interpolation
   with validation, groups related prompts with metadata, and scales to
   more prompts with zero new loading code. Chosen over bare `.md` files
   because `.md` has no structured place for variables or metadata.

5. **RAG is intentionally naive (V1).** `rag.py`'s `load_kb()` reads every
   `.md` file in `kb/` and concatenates them in full into the system
   prompt -- no embeddings, no vector search. This is correct for now
   (KB is ~4 short files, fits easily in context) and should only be
   replaced with real retrieval once the KB grows large enough that it
   no longer fits in context. Don't add embeddings speculatively.

6. **Audio format: 8kHz / 16-bit / mono PCM, everywhere.** Every
   transport (today's web pseudo-call, any future telephony transport)
   uses this format as the common contract. Gemini TTS natively returns
   24kHz PCM; `tts.py` does a manual 3:1 averaging decimation down to
   8kHz (no `audioop`, since it was removed in Python 3.13).

7. **`stt.transcribe()` and `tts.synthesize()` work on in-memory bytes,
   not file paths.** Earlier prototypes wrote WAV files to disk; the
   current versions take/return raw bytes so the websocket handler in
   `main.py` never touches the filesystem per-turn.

8. **`ChatEngine` is instantiated once per call/session**, not shared
   across callers -- it holds that session's `history` list internally.
   `/chat` (HTTP) currently creates a fresh instance per request (no
   memory across HTTP calls yet -- fine for endpoint testing, not meant
   to be multi-turn over plain HTTP). `/audio` (websocket) creates one
   instance per connection and keeps it for the call's duration.

9. **`/audio` websocket protocol:** client streams raw PCM16 binary
   frames continuously while the user speaks, then sends a text frame
   `{"event": "end_of_turn"}` when the user stops. Server transcribes the
   buffered audio, generates a reply, synthesizes it, and streams PCM16
   binary frames back (640-byte frames = 40ms @ 8kHz), followed by a text
   frame `{"event": "reply_end"}`. **The frontend has not been built yet
   and must implement this exact protocol**, including client-side
   silence detection to trigger `end_of_turn` -- this doesn't exist
   anywhere yet.

10. **CORS is wide open (`allow_origins=["*"]`) in `main.py`** for local
    dev convenience since frontend (Vite, port 5173 by default) and
    backend run on different origins. Tighten before any real deployment.

11. **Backend runs on port 8001, not FastAPI's usual 8000.** Port 8000 on
    this machine is permanently occupied by an unrelated project
    (`briefcast`, a separate local FastAPI app under `/working/AI26/briefcast`)
    that's routinely left running. Always start voiceagent's backend with
    `--port 8001` and hit it at `localhost:8001`. Note `config.py`'s
    `PORT` setting is *not* actually wired to the `uvicorn` CLI invocation
    (`main.py` has no `if __name__ == "__main__"` block) -- the `.env`
    `PORT` value is cosmetic/for-future-use only. The `--port` flag on the
    command line is what actually matters today.

12. **Persona routing: one parameterized endpoint set, keyed registry --
    not per-persona routes.** `app/personas.py` holds `PERSONA_REGISTRY`,
    a flat dict of all 15 roadmap items (`key`, `label`, `description`,
    `available`, `prompt_key`). `/chat` takes a `persona` field, `/audio`
    takes a `?persona=` query param, both default to `"sales"` and reject
    (400 / close 4004) any persona that isn't `available`. `ChatEngine`
    looks up the persona's `prompt_key` in the existing `PromptManager`
    registry (decision #4) -- adding a persona later means one new YAML
    template + one new `Persona(..., available=True)` entry, not a new
    route or duplicated handler. Only `"sales"` is `available` today.
    `GET /personas` exposes the registry so the frontend's persona-picker
    doesn't hardcode the roadmap list independently.

13. **`app/call_engine.py`'s `process_turn()` is transport-agnostic and
    shared.** Originally lived inline in `main.py`'s `audio_ws`; pulled
    out so the Twilio integration (decision #15) doesn't duplicate the
    transcribe -> reply -> synthesize -> stream -> interrupt-check logic.
    It takes plain 8kHz/16-bit PCM plus two callables -- `send_frame`
    (outgoing audio) and `send_event` (out-of-band signaling like
    `reply_end`/`interrupted`/`error`) -- so each transport only has to
    adapt its own wire format at the boundary (e.g. Twilio's mu-law codec
    lives entirely in `twilio_voice.py`, never in `call_engine.py`).

14. **KB is editable from the UI, not just readable.** `app/kb_routes.py`
    exposes `GET /kb` (list all `kb/*.md` files + content) and
    `PUT /kb/{filename}` (overwrite one file's content), used by
    `KBPanel.tsx`. Filename is validated to be a plain `*.md` name
    directly inside `KB_DIR` (no path separators, resolved path must
    stay under `KB_DIR`) to block path traversal. This writes straight to
    the same files `rag.py`'s `load_kb()` reads -- no caching layer, no
    versioning; the next `ChatEngine()` construction (i.e. next call)
    picks up whatever was last saved.

15. **Twilio and WhatsApp Business API integrations are real code, but
    unconfigured by default.** Both route into the same `ChatEngine` /
    `process_turn` core as the browser call:
    - **Twilio** (`app/integrations/twilio_voice.py`): `POST /twilio/voice`
      returns TwiML that connects a Media Stream; `WS /twilio/media-stream`
      bridges that stream through `process_turn`. Twilio streams 8kHz
      mu-law, matching this project's 8kHz contract (decision #6) except
      mu-law-companded -- a small hand-rolled G.711 codec handles that (no
      `audioop`, same reason as `tts.py`'s resampler). Since a real caller
      has no client-side JS, this module does its own RMS-based
      end-of-turn/barge-in detection server-side, mirroring
      `CallAdapter.ts`'s thresholds. Gated on `settings.twilio_configured`
      (`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `PUBLIC_BASE_URL` all
      set) -- until then `/twilio/voice` just speaks a "not configured"
      TwiML message.
    - **WhatsApp** (`app/integrations/whatsapp.py`): `GET/POST
      /whatsapp/webhook`, Meta Cloud API, **text only** (no voice notes
      yet). One `ChatEngine` per sender phone number, kept in an in-memory
      dict for the process's lifetime (same "session per caller" model as
      `/audio`, just keyed differently). Gated on
      `settings.whatsapp_configured` (`WHATSAPP_ACCESS_TOKEN` +
      `WHATSAPP_PHONE_NUMBER_ID` set).
    - **WhatsApp Web browser automation (e.g. Playwright) was considered
      and rejected for production use.** Driving the real WhatsApp Web UI
      isn't an official API, breaks WhatsApp's Terms of Service, risks the
      number being banned, and breaks whenever Meta changes the web UI --
      don't build it as a production path. **Update (2026-08-12):** a
      *dev-only* Playwright path for local testing (to skip Meta app
      review/costs while developing) is being discussed but not yet
      scoped or built -- if picked up, keep it fully separate from
      `whatsapp.py`, behind its own opt-in flag, and never pointed at the
      real business number (use a disposable test number so a ban doesn't
      touch production). The tile for it was removed from
      `IntegrationsPanel.tsx` until that's actually built.
    - Neither integration has real credentials yet -- that's intentional,
      deferred until someone actually sets up a Twilio/Meta account. See
      `IntegrationsPanel.tsx` (the frontend's right-sidebar tiles) for the
      exact setup steps, and "Environment / config" below for the env vars.

16. **A cached filler line plays while a turn is being processed.**
    `app/filler_audio.py` synthesizes a small set of "one moment..."
    phrases once (via the existing `tts.synthesize`) and caches them in
    memory; `main.py`'s `lifespan` warms this cache at server startup so
    the first real call never pays synthesis latency for it.
    `call_engine.process_turn` streams a random cached phrase
    (`{"event":"filler_start"}` ... PCM frames ... `{"event":"filler_end"}`)
    as soon as the transcript is confirmed non-empty, *before* the slow
    LLM-reply + TTS-synthesis steps -- covering the ~1-3s gap that used to
    be dead air. On the frontend, `CallAdapter.ts` plays filler and reply
    audio through the same interruptible `AudioBufferSourceNode`
    (`playAudio`/`currentSource`), with a small pending-playback queue so
    a fast real reply arriving before the filler finishes queues behind
    it instead of overlapping. Barge-in during filler playback works
    identically to barge-in during the real reply -- no special-casing.

17. **Manual turn-end button, additive to silence detection.**
    `CallAdapter.endTurn()` sends the same `end_of_turn` signal the
    automatic `SILENCE_DURATION_MS` timer sends, just without waiting --
    wired to CallScreen's "I'm Done Talking" button (shown only while
    `status === "listening"`). Silence-based auto-detection is unchanged;
    this is purely an additional, faster way to trigger the same path.

## Environment / config

`backend/.env` (gitignored, copy from `.env.example`):
```
GEMINI_API_KEY=<real key goes here>
CHAT_MODEL=gemini-2.5-flash
STT_MODEL=gemini-2.5-flash
TTS_MODEL=gemini-2.5-flash-preview-tts
TTS_VOICE=Aoede
HOST=0.0.0.0
PORT=8001

# Optional -- Twilio, blank until a real account exists (decision #15)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
PUBLIC_BASE_URL=

# Optional -- WhatsApp Business Cloud API, blank until configured (decision #15)
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
```
`config.py` raises `RuntimeError` at import time if `GEMINI_API_KEY` is
missing -- this is intentional fail-fast behavior, not a bug. The
Twilio/WhatsApp vars are NOT fail-fast: they default to `""`, and each
integration checks its own `settings.twilio_configured` /
`settings.whatsapp_configured` property at request time instead, so an
unconfigured integration degrades gracefully rather than crashing the app.

## Current status / where things stand

**Both backend and frontend are built and functional as of 2026-08-12.**
Real `GEMINI_API_KEY` is set; `/chat` and `/audio` both work end-to-end
with the Sales persona. Run:
```bash
# backend
cd backend && uv sync && uv run uvicorn app.main:app --reload --port 8001
# frontend, separate terminal
cd frontend && npm install && npm run dev
```
`pyproject.toml` now also depends on `httpx` (added for the WhatsApp
integration's outbound Graph API calls) -- run `uv sync` again if you
pull code that predates that.

**What's implemented:**
- Browser pseudo-call (`/audio`) with barge-in/interrupt support, verbose
  per-call logging, and a UI showing a live mic-level meter + event log
  (decisions #9, #13).
- Persona-picker landing page showing all 15 roadmap items; only
  **AI Sales Agent** is selectable today (decision #12).
- Knowledge base viewer/editor in the UI, backed by `GET/PUT /kb`
  (decision #14).
- Twilio phone-call bridge and WhatsApp Business API webhook, both fully
  coded but **not configured** (no real Twilio/Meta credentials yet) --
  see decision #15 and the frontend's Integrations sidebar for setup steps.
- Cached filler audio ("one moment...") plays during the transcribe/reply/
  synthesize gap (decision #16), and a manual "I'm Done Talking" button
  supplements silence-based turn detection (decision #17).

**Not implemented:** every other persona on the roadmap (support, CRM,
scheduling, etc. -- see `app/personas.py`), real KB retrieval/embeddings
(still intentionally naive, decision #5), WhatsApp voice notes (text
only for now).

## Working conventions from this project's history

- Files were built one at a time in chat, with explicit review-then-paste
  by the user between each. Claude Code can write directly to disk, so
  this specific constraint doesn't need to carry over mechanically -- but
  the underlying intent (small, reviewable, incremental changes; don't
  silently regenerate/rewrite files that already work) should.
- Don't reintroduce complexity that was explicitly rejected (see
  "Architecture decisions" #1) without being asked again.
