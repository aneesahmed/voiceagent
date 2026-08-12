import { useState } from "react";

interface Tile {
  key: string;
  title: string;
  badge?: { label: string; tone: "amber" | "slate" };
  body: string[];
}

const TILES: Tile[] = [
  {
    key: "how-it-works",
    title: "How a call works",
    body: [
      "Audio (browser mic, phone call, or WhatsApp) reaches the backend over that channel's own transport.",
      "The backend transcribes it, generates a reply grounded on the Knowledge Base, and synthesizes speech back in small streamed chunks.",
      "Expect ~1-3s of silence between you finishing a sentence and the reply starting -- that's transcription + generation + synthesis happening in sequence.",
      "You can talk over the assistant while it's replying (barge-in) -- it stops immediately instead of talking over you.",
    ],
  },
  {
    key: "twilio",
    title: "Twilio (phone / SIP trunk)",
    badge: { label: "Not configured", tone: "amber" },
    body: [
      "Backend endpoints already exist: POST /twilio/voice (TwiML) + WS /twilio/media-stream.",
      "Get a Twilio number or SIP trunk, tunnel the backend publicly (e.g. ngrok), set PUBLIC_BASE_URL / TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN in backend/.env.",
      "Point the number's Voice webhook at {PUBLIC_BASE_URL}/twilio/voice. Restart the backend.",
    ],
  },
  {
    key: "whatsapp",
    title: "WhatsApp Business API",
    badge: { label: "Not configured", tone: "amber" },
    body: [
      "Backend endpoint already exists: GET/POST /whatsapp/webhook. Text messages only for now.",
      "Create a Meta app + WhatsApp product, get a Cloud API number, set WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_VERIFY_TOKEN in backend/.env.",
      "Register {PUBLIC_BASE_URL}/whatsapp/webhook in the Meta App Dashboard with that verify token, subscribe to \"messages\".",
    ],
  },
];

export default function IntegrationsPanel() {
  const [expanded, setExpanded] = useState<string | null>("how-it-works");

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] flex flex-col">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Integrations</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Reaching the agent from a real phone or WhatsApp.
        </p>
      </div>

      <div className="space-y-2 overflow-y-auto">
        {TILES.map((tile) => {
          const isOpen = expanded === tile.key;
          return (
            <div key={tile.key} className="border border-slate-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : tile.key)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="text-xs font-medium text-slate-800">{tile.title}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {tile.badge && (
                    <span
                      className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${
                        tile.badge.tone === "amber"
                          ? "text-amber-600 bg-amber-50"
                          : "text-slate-500 bg-slate-100"
                      }`}
                    >
                      {tile.badge.label}
                    </span>
                  )}
                  <span className="text-slate-400 text-xs">{isOpen ? "−" : "+"}</span>
                </div>
              </button>

              {isOpen && (
                <ol className="px-3 pb-3 space-y-1.5">
                  {tile.body.map((line, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-slate-600">
                      <span className="text-slate-400">{i + 1}.</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
