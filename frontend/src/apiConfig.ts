// Backend host is derived from whatever host the page was loaded from,
// rather than hardcoded to localhost -- so the same build works when
// opened from another computer on the LAN (via the dev server's --host
// network URL) without editing source per-machine. Backend always runs
// on port 8001 (see CLAUDE.md decision #11).
const BACKEND_HOST = `${window.location.hostname}:8001`;

export const API_BASE_URL = `http://${BACKEND_HOST}`;
export const WS_BASE_URL = `ws://${BACKEND_HOST}/audio`;
