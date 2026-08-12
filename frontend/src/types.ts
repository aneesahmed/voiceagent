export type CallStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "error"
  | "ended";

export interface Persona {
  key: string;
  label: string;
  description: string;
  available: boolean;
}

export interface CallAdapterCallbacks {
  onStatusChange: (status: CallStatus) => void;
  onError: (message: string) => void;
  // Live mic input level (RMS, roughly 0-1) -- fired continuously while the
  // mic is capturing so the UI can show visual proof audio is being heard.
  onAudioLevel: (level: number) => void;
  // Human-readable event log line (connection, turn boundaries, barge-in,
  // server events) -- fired for the UI's scrolling debug panel.
  onDebug: (message: string) => void;
}
