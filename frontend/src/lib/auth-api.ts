const BASE = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

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
    throw new Error(
      err.email?.[0] || err.password?.[0] || err.error || "Registration failed",
    );
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
    throw new Error(err.error || "Invalid email or password");
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
