import React, { useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

const sans = "'DM Sans', sans-serif";
const serif = "'DM Serif Display', serif";
const mono = "'JetBrains Mono', monospace";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const modalRef = useRef<HTMLDivElement>(null);

  const from = location.state?.from?.pathname || "/dashboard";

  // Handle click outside to go home
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      navigate("/");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await axios.post(`${BACKEND_BASE}/api/token/`, {
        email,
        password,
      });

      const token = response.data.access || response.data.token;
      
      if (token) {
        login(token);
        navigate(from, { replace: true });
      } else {
        throw new Error("No token received from server.");
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(
        err.response?.data?.detail || 
        err.response?.data?.error || 
        "Invalid credentials. Please verify your email and password."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle} onClick={handleOverlayClick}>
      <div style={glowTopStyle} />
      <div style={glowBottomStyle} />

      <div ref={modalRef} style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h2 style={titleStyle}>FinDash Terminal</h2>
          <p style={subtitleStyle}>Authorized Personnel Only</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {error && <div style={errorStyle}>{error}</div>}

          <div style={inputGroupStyle}>
            <label style={labelStyle}>EMAIL ADDRESS</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@findash.io"
              style={inputStyle}
            />
          </div>

          <div style={inputGroupStyle}>
            <label style={labelStyle}>PASSWORD</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
              ...buttonStyle,
              ...(isHovered ? buttonHoverStyle : {}),
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "VERIFYING..." : "INITIALIZE SESSION"}
          </button>
        </form>

        <div style={footerLinkStyle}>
          <span style={{ opacity: 0.5 }}>New to the platform?</span>
          <button 
            onClick={() => navigate("/register")}
            style={textButtonStyle}
          >
            Register here.
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Styles ---

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#04060c",
  padding: "20px",
  position: "relative",
  overflow: "hidden",
  cursor: "pointer",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 400,
  padding: "48px 40px",
  background: "rgba(10, 15, 28, 0.85)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(0, 180, 255, 0.15)",
  borderRadius: 24,
  boxShadow: "0 40px 100px rgba(0, 0, 0, 0.8)",
  zIndex: 10,
  cursor: "default",
};

const titleStyle: React.CSSProperties = {
  fontFamily: serif,
  fontSize: 32,
  color: "#e0f0ff",
  letterSpacing: "-0.02em",
  marginBottom: 4,
};

const subtitleStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 10,
  textTransform: "uppercase",
  color: "#00d4ff",
  letterSpacing: "0.2em",
  opacity: 0.8,
};

const inputGroupStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 10,
  fontWeight: 600,
  color: "rgba(0, 180, 255, 0.6)",
  letterSpacing: "0.1em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 48,
  padding: "0 16px",
  background: "rgba(255, 255, 255, 0.03)",
  border: "1px solid rgba(0, 180, 255, 0.15)",
  borderRadius: 12,
  color: "#ffffff",
  fontSize: 15,
  fontFamily: sans,
  outline: "none",
  transition: "all 0.2s ease",
};

const buttonStyle: React.CSSProperties = {
  marginTop: 12,
  height: 52,
  background: "#00d4ff",
  border: "none",
  borderRadius: 12,
  color: "#04060c",
  fontSize: 13,
  fontFamily: mono,
  fontWeight: 700,
  letterSpacing: "0.1em",
  transition: "all 0.3s ease",
  boxShadow: "0 0 20px rgba(0, 212, 255, 0.2)",
};

const buttonHoverStyle: React.CSSProperties = {
  background: "#ffffff",
  transform: "translateY(-2px)",
  boxShadow: "0 10px 25px rgba(0, 212, 255, 0.4)",
};

const errorStyle: React.CSSProperties = {
  padding: "12px 16px",
  background: "rgba(255, 80, 80, 0.08)",
  border: "1px solid rgba(255, 80, 80, 0.2)",
  borderRadius: 8,
  color: "#ff8080",
  fontSize: 13,
  fontFamily: sans,
  lineHeight: 1.4,
};

const footerLinkStyle: React.CSSProperties = {
  marginTop: 32,
  textAlign: "center",
  fontFamily: sans,
  fontSize: 13,
  color: "#e0f0ff",
};

const textButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#00d4ff",
  fontFamily: sans,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  marginLeft: 6,
  padding: 0,
};

const glowTopStyle: React.CSSProperties = {
  position: "absolute",
  top: "-10%",
  left: "30%",
  width: "40vw",
  height: "40vw",
  background: "radial-gradient(circle, rgba(0, 114, 255, 0.15) 0%, transparent 70%)",
  filter: "blur(60px)",
  pointerEvents: "none",
};

const glowBottomStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "-10%",
  right: "20%",
  width: "50vw",
  height: "50vw",
  background: "radial-gradient(circle, rgba(0, 212, 255, 0.1) 0%, transparent 70%)",
  filter: "blur(80px)",
  pointerEvents: "none",
};
