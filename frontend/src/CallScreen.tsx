import { useCallback, useRef, useState } from "react";
import { CallAdapter } from "./CallAdapter";
import type { CallStatus, Persona } from "./types";
import { WS_BASE_URL } from "./apiConfig";
const MAX_LOG_LINES = 100;

const STATUS_LABEL: Record<CallStatus, string> = {
  idle: "Ready when you are",
  connecting: "Connecting…",
  listening: "Listening…",
  processing: "Thinking…",
  speaking: "Speaking…",
  error: "Something went wrong",
  ended: "Call ended",
};

const STATUS_DOT: Record<CallStatus, string> = {
  idle: "bg-slate-300",
  connecting: "bg-amber-400 animate-pulse",
  listening: "bg-emerald-400 animate-pulse",
  processing: "bg-amber-400 animate-pulse",
  speaking: "bg-sky-400 animate-pulse",
  error: "bg-red-500",
  ended: "bg-slate-300",
};

function timestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

interface CallScreenProps {
  persona: Persona;
  onBack: () => void;
}

export default function CallScreen({ persona, onBack }: CallScreenProps) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const adapterRef = useRef<CallAdapter | null>(null);

  const startCall = useCallback(async () => {
    setError(null);
    setLog([]);
    const adapter = new CallAdapter({
      onStatusChange: setStatus,
      onError: setError,
      onAudioLevel: setLevel,
      onDebug: (message) => {
        setLog((prev) => [...prev.slice(-(MAX_LOG_LINES - 1)), `${timestamp()}  ${message}`]);
      },
    });
    adapterRef.current = adapter;
    const wsUrl = `${WS_BASE_URL}?persona=${encodeURIComponent(persona.key)}`;
    await adapter.startCall(wsUrl);
  }, [persona.key]);

  const endCall = useCallback(() => {
    adapterRef.current?.endCall();
    adapterRef.current = null;
    setLevel(0);
  }, []);

  const inCall = status !== "idle" && status !== "ended" && status !== "error";
  const meterPercent = Math.min(100, Math.round(level * 400));

  return (
    <div className="w-full max-w-md mx-auto">

      <button
          onClick={onBack}
          disabled={inCall}
          className="text-sm text-slate-500 hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed mb-6"
        >
          ← Change persona
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-900 text-white text-2xl mb-4">
            🎙️
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Meridian ERP</h1>
          <p className="text-slate-500 text-sm mt-1">{persona.label}</p>
        </div>

        {/* Call card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} />
            <span className="text-sm text-slate-600">{STATUS_LABEL[status]}</span>
          </div>

          {/* Mic level meter -- visual proof audio is reaching the pipeline */}
          {inCall && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Mic level</span>
                <span>{status === "listening" ? "sending to backend" : "muted (assistant's turn)"}</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-75 ${
                    status === "listening" ? "bg-emerald-400" : "bg-slate-300"
                  }`}
                  style={{ width: `${meterPercent}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4">
              {error}
            </p>
          )}

          {inCall ? (
            <div className="space-y-2">
              {status === "listening" && (
                <button
                  onClick={() => adapterRef.current?.endTurn()}
                  className="w-full py-3 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-medium transition"
                >
                  I'm Done Talking
                </button>
              )}
              <button
                onClick={endCall}
                className="w-full py-3 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium transition"
              >
                End Call
              </button>
            </div>
          ) : (
            <button
              onClick={startCall}
              className="w-full py-3 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition shadow-sm"
            >
              Start Call
            </button>
          )}

          <p className="text-xs text-slate-400 mt-4">
            Mic access required. Chrome or Edge recommended.
          </p>
        </div>

        {/* Debug / event log */}
        {log.length > 0 && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-200 p-4">
            <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
              Call log
            </h2>
            <div className="h-40 overflow-y-auto font-mono text-xs text-slate-600 space-y-1">
              {log.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          </div>
        )}

        {/* User guidelines */}
        <div className="mt-6 bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-medium text-slate-900 mb-3">How it works</h2>
          <ol className="space-y-2 text-sm text-slate-600">
            <li className="flex gap-2">
              <span className="text-slate-400">1.</span>
              Click <strong className="text-slate-800 font-medium">Start Call</strong> and allow microphone access.
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400">2.</span>
              Just talk naturally. It'll reply once you pause -- or click "I'm Done Talking" to skip the wait.
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400">3.</span>
              You can speak over the assistant to interrupt it while it's replying.
            </li>
            <li className="flex gap-2">
              <span className="text-slate-400">4.</span>
              Ask about pricing, features, or anything about Meridian ERP.
            </li>
          </ol>
        </div>

    </div>
  );
}
