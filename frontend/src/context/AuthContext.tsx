import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { jwtDecode } from "jwt-decode";

/**
 * Define the shape of the User object stored in the JWT.
 * 'exp' is mandatory for the auto-logout check.
 */
interface User {
  id: string;
  email: string;
  name?: string;
  exp: number; // Expiration timestamp in seconds
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. Initialize: Check localStorage for an existing token when the app starts
  useEffect(() => {
    const savedToken = localStorage.getItem("findash_token");
    if (savedToken) {
      try {
        const decoded = jwtDecode<User>(savedToken);
        
        // Check if token is expired
        // (decoded.exp is in seconds, Date.now() is in milliseconds)
        if (decoded.exp * 1000 < Date.now()) {
          handleLogout();
        } else {
          setToken(savedToken);
          setUser(decoded);
        }
      } catch (err) {
        console.error("Invalid or malformed token found:", err);
        handleLogout();
      }
    }
    setLoading(false);
  }, []);

  // 2. Login: Saves the token to local storage and updates state
  const handleLogin = (newToken: string) => {
    try {
      const decoded = jwtDecode<User>(newToken);
      localStorage.setItem("findash_token", newToken);
      setToken(newToken);
      setUser(decoded);
    } catch (err) {
      console.error("Failed to decode login token:", err);
    }
  };

  // 3. Logout: Clears local storage and resets state
  const handleLogout = () => {
    localStorage.removeItem("findash_token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        token, 
        login: handleLogin, 
        logout: handleLogout, 
        loading 
      }}
    >
      {/* We only render the app once we've finished the initial 
          localStorage check to prevent "flickering" UI 
      */}
      {!loading && children}
    </AuthContext.Provider>
  );
}

/**
 * Custom hook to use the AuthContext easily in any component.
 * Example: const { user, logout } = useAuth();
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider. Check your main.tsx setup.");
  }
  return context;
}