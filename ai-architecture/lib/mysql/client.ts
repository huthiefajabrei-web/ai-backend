/**
 * Backend API client.
 * Communicates with FastAPI backed by Firestore via DATABASE_URL.
 * Authentication uses a Bearer token stored in localStorage via Firebase Auth.
 */
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../firebase";

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
export interface AppUser {
  id: string;
  email: string;
  full_name?: string | null;
  credits?: number;
  plan_id?: string | null;
  plan_name?: string;
  is_pro?: number;
  is_admin?: boolean;
}

export interface AppSession {
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
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const token = await userCredential.user.getIdToken();
    setToken(token);
    
    // Call /auth/me to implicitly create the user in Firestore backend
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.ok) {
       setStoredUser(data.user);
       return { ok: true, user: data.user, token };
    }
    return data;
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function apiLogin(email: string, password: string) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const token = await userCredential.user.getIdToken();
    setToken(token);
    
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.ok) {
       setStoredUser(data.user);
       return { ok: true, user: data.user, token };
    }
    return data;
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function apiLogout() {
  try {
    await signOut(auth);
  } catch (e) {}
  removeToken();
}

// Sentinel to distinguish "network error" from "token invalid"
export const AUTH_NETWORK_ERROR = Symbol("AUTH_NETWORK_ERROR");

export async function apiGetMe(): Promise<AppUser | null | typeof AUTH_NETWORK_ERROR> {
  const token = await getValidToken();
  if (!token) return null;
  try {
    // Optionally refresh token here if using Firebase listener, but relying on backend verification is fine
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // 401/403 = token definitively invalid
    if (res.status === 401 || res.status === 403) {
      removeToken(); // Clear token if unauthorized
      return null;
    }
    // Other non-ok (5xx, network issues handled by catch) = treat as network error
    if (!res.ok) return AUTH_NETWORK_ERROR;
    const data = await res.json();
    return data.ok ? data.user : null;
  } catch {
    // Network unreachable / server down
    return AUTH_NETWORK_ERROR;
  }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
export async function getValidToken() {
  if (typeof window !== "undefined") {
    await auth.authStateReady();
  }
  let token = getToken();
  if (auth.currentUser) {
    try {
      token = await auth.currentUser.getIdToken(true);
      setToken(token);
    } catch (e) {}
  }
  return token;
}

async function authHeaders() {
  const token = await getValidToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function apiGetSessions(): Promise<AppSession[]> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/sessions`, { headers });
    const data = await res.json();
    return data.ok ? data.data : [];
  } catch {
    return [];
  }
}

export async function apiCreateSession(title: string, resps = {}): Promise<AppSession | null> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/sessions`, {
      method: "POST",
      headers,
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
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/sessions/${id}`, {
      method: "PATCH",
      headers,
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
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/sessions/${id}`, {
      method: "DELETE",
      headers,
    });
    const data = await res.json();
    return !!data.ok;
  } catch {
    return false;
  }
}

// Backward-compatible aliases for existing imports.
export type MySQLUser = AppUser;
export type MySQLSession = AppSession;

// ─── Subscription / Credits ───────────────────────────────────────────────────
export async function apiSubscribe(plan_id: string): Promise<{ ok: boolean; user?: AppUser; credits_added?: number; plan?: string; error?: string }> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/subscribe`, {
      method: "POST",
      headers,
      body: JSON.stringify({ plan_id }),
    });
    if (!res.ok) {
      try {
        const errJson = await res.json();
        return { ok: false, error: errJson.error || "Server error" };
      } catch {
        return { ok: false, error: `HTTP ${res.status} error` };
      }
    }
    return await res.json();
  } catch (err: any) {
    console.error("apiSubscribe fetch error:", err);
    return { ok: false, error: err.message || "Network error" };
  }
}

export async function apiGetCredits(): Promise<{ ok: boolean; credits?: number; plan_name?: string; error?: string }> {
  try {
    const headers = await authHeaders();
    const res = await fetch(`${API_BASE}/credits`, { headers });
    return res.json();
  } catch {
    return { ok: false, error: "Network error" };
  }
}
