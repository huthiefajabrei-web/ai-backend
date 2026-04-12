/**
 * MySQL API Client
 * Communicates with the FastAPI backend which connects to MySQL.
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

export async function apiCreateSession(title: string, resps = {}): Promise<MySQLSession | null> {
  try {
    const res = await fetch(`${API_BASE}/sessions`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ title, resps }),
    });
    const data = await res.json();
    return data.ok ? data.data : null;
  } catch {
    return null;
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
