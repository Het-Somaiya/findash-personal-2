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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setInterval>>();

  const startRefreshTimer = useCallback(() => {
    clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(async () => {
      try {
        const { access } = await apiRefresh();
        setAccessToken(access);
      } catch {
        setUser(null);
        setAccessToken(null);
        clearInterval(refreshTimer.current);
      }
    }, REFRESH_INTERVAL_MS);
  }, []);

  // Silent refresh on mount — restores session from httpOnly cookie
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { access } = await apiRefresh();
        if (cancelled) return;
        setAccessToken(access);
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
      setUser(res.user);
      startRefreshTimer();
    },
    [startRefreshTimer],
  );

  const register = useCallback(
    async (email: string, name: string, password: string) => {
      const res = await apiRegister(email, name, password);
      setAccessToken(res.access);
      setUser(res.user);
      startRefreshTimer();
    },
    [startRefreshTimer],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setAccessToken(null);
    clearInterval(refreshTimer.current);
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
