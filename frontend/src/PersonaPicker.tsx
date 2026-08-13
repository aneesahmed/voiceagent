import { useEffect, useState } from "react";
import type { Persona } from "./types";
import { API_BASE_URL } from "./apiConfig";

interface PersonaPickerProps {
  onSelect: (persona: Persona) => void;
}

export default function PersonaPicker({ onSelect }: PersonaPickerProps) {
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/personas`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Persona[]) => setPersonas(data))
      .catch(() => setError("Couldn't reach the backend. Is it running on port 8001?"));
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto">

      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-900 text-white text-2xl mb-4">
          🎙️
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">Meridian ERP</h1>
        <p className="text-slate-500 text-sm mt-1">
          Choose a persona to start a call
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-6 text-center">
          {error}
        </p>
      )}

      {!personas && !error && (
        <p className="text-center text-sm text-slate-400">Loading personas…</p>
      )}

      {personas && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {personas.map((persona) => (
            <button
              key={persona.key}
              disabled={!persona.available}
              onClick={() => onSelect(persona)}
              className={`text-left rounded-2xl border p-5 transition ${
                persona.available
                  ? "bg-white border-slate-200 hover:border-emerald-400 hover:shadow-sm cursor-pointer"
                  : "bg-slate-50 border-slate-100 cursor-not-allowed opacity-60"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium text-slate-900">{persona.label}</h2>
                {persona.available ? (
                  <span className="text-xs font-medium text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                    Available
                  </span>
                ) : (
                  <span className="text-xs font-medium text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                    Coming soon
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">{persona.description}</p>
            </button>
          ))}
        </div>
      )}

    </div>
  );
}
