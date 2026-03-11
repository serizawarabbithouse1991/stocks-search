const API_BASE =
  (typeof import.meta.env !== "undefined" && import.meta.env.VITE_API_BASE) ||
  "http://127.0.0.1:8001";

function authHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export interface AuthResponse {
  token: string;
  user: { id: number; username: string };
}

export async function register(
  username: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Registration failed");
  }
  return res.json();
}

export async function login(
  username: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Login failed");
  }
  return res.json();
}

export async function fetchMe(
  token: string
): Promise<{ id: number; username: string }> {
  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Token invalid");
  return res.json();
}

// ── Sync APIs ──

export interface SyncSettings {
  theme: string;
  locale: string;
  selected_tickers: { code: string; name: string }[];
}

export async function getSettings(token: string): Promise<SyncSettings> {
  const res = await fetch(`${API_BASE}/api/sync/settings`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch settings");
  return res.json();
}

export async function putSettings(
  token: string,
  settings: SyncSettings
): Promise<void> {
  await fetch(`${API_BASE}/api/sync/settings`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(settings),
  });
}

export interface SyncWatchlist {
  id: string;
  name: string;
  tickers: { code: string; name: string }[];
  createdAt: string;
}

export async function getWatchlists(
  token: string
): Promise<{ watchlists: SyncWatchlist[] }> {
  const res = await fetch(`${API_BASE}/api/sync/watchlists`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error("Failed to fetch watchlists");
  return res.json();
}

export async function putWatchlists(
  token: string,
  watchlists: SyncWatchlist[]
): Promise<void> {
  await fetch(`${API_BASE}/api/sync/watchlists`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify({ watchlists }),
  });
}
