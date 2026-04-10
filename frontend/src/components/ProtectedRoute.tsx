import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * ProtectedRoute
 * * A wrapper component that checks if a user is authenticated.
 * 1. If 'loading', it renders nothing (prevents UI flicker).
 * 2. If 'user' exists, it renders the protected component (children).
 * 3. If 'user' is null, it redirects to /login and saves the attempted URL.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // IMPORTANT: While the AuthProvider is still checking for an 
  // existing token in localStorage, we must return null or a loader.
  // This prevents the app from redirecting a logged-in user to /login 
  // for a split-second during a page refresh.
  if (loading) {
    return (
      <div style={{ 
        height: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        background: "#06080e",
        color: "#00d4ff",
        fontFamily: "sans-serif"
      }}>
        Loading session...
      </div>
    );
  }

  if (!user) {
    // We pass the current 'location' to the login page state.
    // This allows us to redirect the user back to where they were 
    // trying to go after they successfully log in.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}