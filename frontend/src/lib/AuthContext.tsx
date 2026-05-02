import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  apiGetMe,
  apiLogin,
  apiLogout,
  apiRefresh,
  apiRegister,
  type AuthUser,
} from "./auth-api";
import { setAuthToken } from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const REFRESH_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes (access token lives 15)
const LEGACY_TOKEN_KEY = "findash_token";

// Bypass real auth so post-login UI renders without backend access.
// Flip to false once the Azure SQL firewall is opened.
const DEV_MOCK_AUTH = false;
const MOCK_USER: AuthUser = {
  id: 0,
  email: "dev@local",
  name: "Dev",
  created_at: new Date().toISOString(),
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(
    DEV_MOCK_AUTH ? MOCK_USER : null,
  );
  const [accessToken, setAccessToken] = useState<string | null>(
    DEV_MOCK_AUTH ? "mock-access-token" : null,
  );
  const [loading, setLoading] = useState(!DEV_MOCK_AUTH);
  const refreshTimer = useRef<ReturnType<typeof setInterval>>();

  const startRefreshTimer = useCallback(() => {
    clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(async () => {
      try {
        const { access } = await apiRefresh();
        setAccessToken(access);
        setAuthToken(access);
      } catch {
        setUser(null);
        setAccessToken(null);
        setAuthToken(null);
        clearInterval(refreshTimer.current);
      }
    }, REFRESH_INTERVAL_MS);
  }, []);

  // Silent refresh on mount — restores session from httpOnly cookie
  useEffect(() => {
    if (DEV_MOCK_AUTH) return;
    let cancelled = false;
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    (async () => {
      try {
        const { access } = await apiRefresh();
        if (cancelled) return;
        setAccessToken(access);
        setAuthToken(access);
        const me = await apiGetMe(access);
        if (cancelled) return;
        setUser(me);
        startRefreshTimer();
      } catch {
        // No valid session — that's fine
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(refreshTimer.current);
    };
  }, [startRefreshTimer]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await apiLogin(email, password);
      setAccessToken(res.access);
      setAuthToken(res.access);
      setUser(res.user);
      startRefreshTimer();
    },
    [startRefreshTimer],
  );

  const register = useCallback(
    async (email: string, name: string, password: string) => {
      const res = await apiRegister(email, name, password);
      setAccessToken(res.access);
      setAuthToken(res.access);
      setUser(res.user);
      startRefreshTimer();
    },
    [startRefreshTimer],
  );

  const logout = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      setUser(null);
      setAccessToken(null);
      setAuthToken(null);
      clearInterval(refreshTimer.current);
    }
  }, []);

  const value = useMemo(
    () => ({ user, accessToken, loading, login, register, logout }),
    [user, accessToken, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
