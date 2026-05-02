const BASE = import.meta.env.VITE_BACKEND_URL ?? "";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface AuthResponse {
  access: string;
  user: AuthUser;
}

export interface ActiveSession {
  id: number;
  device_info: string;
  ip_address: string;
  created_at: string;
  last_used: string;
}

const authHeaders = { "Content-Type": "application/json" };

function errorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const data = payload as Record<string, unknown>;
  for (const key of ["email", "password", "name", "non_field_errors", "detail", "error"]) {
    const value = data[key];
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

export async function apiRegister(
  email: string,
  name: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/api/auth/register/`, {
    method: "POST",
    headers: authHeaders,
    credentials: "include",
    body: JSON.stringify({ email, name, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(errorMessage(err, "Registration failed"));
  }
  return res.json();
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/api/auth/login/`, {
    method: "POST",
    headers: authHeaders,
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(errorMessage(err, "Invalid email or password"));
  }
  return res.json();
}

export async function apiLogout(): Promise<void> {
  await fetch(`${BASE}/api/auth/logout/`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders,
  });
}

export async function apiLogoutAll(): Promise<void> {
  await fetch(`${BASE}/api/auth/logout-all/`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders,
  });
}

export async function apiRefresh(): Promise<{ access: string }> {
  const res = await fetch(`${BASE}/api/auth/refresh/`, {
    method: "POST",
    credentials: "include",
    headers: authHeaders,
  });
  if (!res.ok) throw new Error("Refresh failed");
  return res.json();
}

export async function apiGetMe(accessToken: string): Promise<AuthUser> {
  const res = await fetch(`${BASE}/api/auth/me/`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}

export async function apiGetSessions(
  accessToken: string,
): Promise<ActiveSession[]> {
  const res = await fetch(`${BASE}/api/auth/sessions/`, {
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Unauthorized");
  return res.json();
}
