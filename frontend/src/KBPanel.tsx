import { useEffect, useState } from "react";
import { API_BASE_URL } from "./apiConfig";

interface KBDocument {
  filename: string;
  content: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function KBPanel() {
  const [docs, setDocs] = useState<KBDocument[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/kb`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: KBDocument[]) => {
        setDocs(data);
        setDrafts(Object.fromEntries(data.map((d) => [d.filename, d.content])));
      })
      .catch(() => setError("Couldn't reach the backend."));
  }, []);

  const save = async (filename: string) => {
    setSaveState((prev) => ({ ...prev, [filename]: "saving" }));
    try {
      const res = await fetch(`${API_BASE_URL}/kb/${encodeURIComponent(filename)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: drafts[filename] }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveState((prev) => ({ ...prev, [filename]: "saved" }));
    } catch {
      setSaveState((prev) => ({ ...prev, [filename]: "error" }));
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] flex flex-col">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Knowledge Base</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          What the AI Sales Agent grounds its replies in. Click a document to edit.
        </p>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1.5">{error}</p>}
      {!docs && !error && <p className="text-xs text-slate-400">Loading…</p>}

      <div className="space-y-2 overflow-y-auto">
        {docs?.map((doc) => {
          const isOpen = expanded === doc.filename;
          const dirty = drafts[doc.filename] !== doc.content;
          const state = saveState[doc.filename] ?? "idle";
          return (
            <div key={doc.filename} className="border border-slate-100 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : doc.filename)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="text-xs font-mono text-slate-700 truncate">{doc.filename}</span>
                <span className="text-slate-400 text-xs">{isOpen ? "−" : "+"}</span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3">
                  <textarea
                    value={drafts[doc.filename] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [doc.filename]: e.target.value }))
                    }
                    spellCheck={false}
                    className="w-full h-40 font-mono text-[11px] leading-relaxed text-slate-700 border border-slate-100 rounded-lg p-2 resize-y focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[11px]">
                      {state === "saved" && !dirty && <span className="text-emerald-600">Saved</span>}
                      {state === "error" && <span className="text-red-600">Save failed</span>}
                    </span>
                    <button
                      onClick={() => save(doc.filename)}
                      disabled={!dirty || state === "saving"}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-slate-900 text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {state === "saving" ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
