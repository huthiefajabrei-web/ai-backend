/**
 * Session/auth API client
 * Talks to the FastAPI backend (PostgreSQL via DATABASE_URL on the server).
 * Authentication uses a Bearer token stored in localStorage.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ─── Token helpers ──────────────────────────────────────────────────────────
export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("harch_token") || "";
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("harch_token", token);
}

export function removeToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("harch_token");
  localStorage.removeItem("harch_user");
  localStorage.removeItem("currentSessionId");
}

export function getStoredUser(): MySQLUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("harch_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: MySQLUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem("harch_user", JSON.stringify(user));
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface MySQLUser {
  id: string;
  email: string;
  full_name?: string | null;
  credits?: number;
  is_pro?: number;
}

export interface MySQLSession {
  id: string;
  user_id: string;
  title: string;
  resps: Record<string, unknown>;
  parent_session_id?: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export async function apiRegister(email: string, password: string, full_name?: string) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, full_name }),
  });
  return res.json();
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return res.json();
}

export async function apiLogout() {
  const token = getToken();
  if (!token) return;
  await fetch(`${API_BASE}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  removeToken();
}

export async function apiGetMe(): Promise<MySQLUser | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? data.user : null;
  } catch {
    return null;
  }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

export async function apiGetSessions(): Promise<MySQLSession[]> {
  try {
    const res = await fetch(`${API_BASE}/sessions`, { headers: authHeaders() });
    const data = await res.json();
    return data.ok ? data.data : [];
  } catch {
    return [];
  }
}

export type ApiCreateSessionResult =
  | { ok: true; data: MySQLSession }
  | { ok: false; error: string };

export async function apiCreateSession(
  title: string,
  resps = {}
): Promise<ApiCreateSessionResult> {
  try {
    const res = await fetch(`${API_BASE}/sessions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title, resps }),
    });
    let data: { ok?: boolean; data?: MySQLSession; error?: string } = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (data.ok && data.data) {
      return { ok: true, data: data.data };
    }
    const serverErr =
      typeof data.error === "string" && data.error.trim() ? data.error.trim() : null;
    if (!res.ok) {
      return {
        ok: false,
        error:
          serverErr ||
          `Request failed (${res.status}). Check that NEXT_PUBLIC_API_URL points to your API.`,
      };
    }
    return {
      ok: false,
      error: serverErr || "Unexpected response from server.",
    };
  } catch (e) {
    const hint =
      typeof window !== "undefined" && window.location.hostname !== "localhost"
        ? " On production, set NEXT_PUBLIC_API_URL to your public API URL (not localhost)."
        : "";
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `Network error: ${msg}.${hint}`,
    };
  }
}

export async function apiUpdateSession(
  id: string,
  updates: { title?: string; resps?: Record<string, unknown> }
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/sessions/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    return !!data.ok;
  } catch {
    return false;
  }
}

export async function apiDeleteSession(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/sessions/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    const data = await res.json();
    return !!data.ok;
  } catch {
    return false;
  }
}
