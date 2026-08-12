import { useState } from "react";
import CallScreen from "./CallScreen";
import IntegrationsPanel from "./IntegrationsPanel";
import KBPanel from "./KBPanel";
import PersonaPicker from "./PersonaPicker";
import type { Persona } from "./types";

export default function App() {
  const [persona, setPersona] = useState<Persona | null>(null);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_300px] gap-6 items-start">
        <aside className="order-2 lg:order-1">
          <KBPanel />
        </aside>

        <main className="order-1 lg:order-2 py-4">
          {persona ? (
            <CallScreen persona={persona} onBack={() => setPersona(null)} />
          ) : (
            <PersonaPicker onSelect={setPersona} />
          )}
        </main>

        <aside className="order-3">
          <IntegrationsPanel />
        </aside>
      </div>
    </div>
  );
}
