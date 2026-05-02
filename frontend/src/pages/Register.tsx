import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";

const sans = "'DM Sans', sans-serif";
const serif = "'DM Serif Display', serif";
const mono = "'JetBrains Mono', monospace";

export function Register() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    dialCode: "+1",
    mobile: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [validations, setValidations] = useState({
    upper: false,
    lower: false,
    digit: false,
    special: false,
    length: false,
    match: false,
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const modalRef = useRef<HTMLDivElement>(null);

  // --- Real-time Validation Logic ---
  useEffect(() => {
    const { password, confirmPassword } = formData;
    setValidations({
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      digit: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      length: password.length >= 8,
      match: password === confirmPassword && password !== "",
    });
  }, [formData.password, formData.confirmPassword]);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email);
  const isMobileValid = /^\d{7,15}$/.test(formData.mobile);
  const isFormComplete = formData.firstName && formData.lastName && isEmailValid && isMobileValid;
  const arePasswordsSecure = Object.values(validations).every(Boolean);
  const canSubmit = isFormComplete && arePasswordsSecure && !loading;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleOutsideClick = (e: React.MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      navigate("/");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");
    setLoading(true);

    try {
      // 1. Create the user account using DIRECT PATH
      // This goes through the Vite Proxy to avoid tunnel authentication issues.
      await axios.post("/api/register/", {
        username: formData.email, 
        email: formData.email,
        first_name: formData.firstName,
        last_name: formData.lastName,
        password: formData.password,
      });

      // 2. Automatically log them in to get the token using DIRECT PATH
      const loginRes = await axios.post("/api/token/", {
        username: formData.email, 
        password: formData.password,
      });

      const token = loginRes.data.access || loginRes.data.token;
      
      if (token) {
        login(token);
        navigate("/dashboard");
      } else {
        navigate("/login");
      }
    } catch (err: any) {
      const serverError = err.response?.data?.detail || 
                         err.response?.data?.email?.[0] || 
                         err.response?.data?.username?.[0] ||
                         "Registration failed. The system could not initialize your credentials.";
      setError(serverError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle} onClick={handleOutsideClick}>
      <div style={glowTopStyle} />
      <div style={glowBottomStyle} />

      <div ref={modalRef} style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h2 style={titleStyle}>Create Account</h2>
          <p style={subtitleStyle}>Initialize Terminal Credentials</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <div style={errorStyle}>{error}</div>}

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ ...inputGroupStyle, flex: 1 }}>
              <label style={labelStyle}>FIRST NAME</label>
              <input name="firstName" type="text" required value={formData.firstName} onChange={handleChange} placeholder="John" style={inputStyle} />
            </div>
            <div style={{ ...inputGroupStyle, flex: 1 }}>
              <label style={labelStyle}>LAST NAME</label>
              <input name="lastName" type="text" required value={formData.lastName} onChange={handleChange} placeholder="Doe" style={inputStyle} />
            </div>
          </div>

          <div style={inputGroupStyle}>
            <label style={labelStyle}>MOBILE NUMBER</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select 
                name="dialCode" 
                value={formData.dialCode} 
                onChange={handleChange} 
                style={{ ...inputStyle, width: 90, padding: '0 8px' }}
              >
                <option value="+1">+1 (US)</option>
                <option value="+44">+44 (UK)</option>
                <option value="+91">+91 (IN)</option>
                <option value="+61">+61 (AU)</option>
              </select>
              <input 
                name="mobile" 
                type="tel" 
                required 
                value={formData.mobile} 
                onChange={handleChange} 
                placeholder="5550123" 
                style={{ ...inputStyle, flex: 1 }} 
              />
            </div>
          </div>

          <div style={inputGroupStyle}>
            <label style={labelStyle}>EMAIL ID</label>
            <input name="email" type="email" required value={formData.email} onChange={handleChange} placeholder="operator@findash.io" style={inputStyle} />
          </div>

          <div style={inputGroupStyle}>
            <label style={labelStyle}>PASSWORD</label>
            <input name="password" type="password" required value={formData.password} onChange={handleChange} placeholder="••••••••" style={inputStyle} />
          </div>

          <div style={inputGroupStyle}>
            <label style={labelStyle}>CONFIRM PASSWORD</label>
            <input name="confirmPassword" type="password" required value={formData.confirmPassword} onChange={handleChange} placeholder="••••••••" style={inputStyle} />
          </div>

          <div style={checklistStyle}>
            <RequirementItem label="One uppercase letter" met={validations.upper} />
            <RequirementItem label="One lowercase letter" met={validations.lower} />
            <RequirementItem label="One digit" met={validations.digit} />
            <RequirementItem label="One special character" met={validations.special} />
            <RequirementItem label="At least 8 characters" met={validations.length} />
            <RequirementItem label="Must be same as confirm password" met={validations.match} />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
              ...buttonStyle,
              ...(isHovered && canSubmit ? buttonHoverStyle : {}),
              opacity: canSubmit ? 1 : 0.4,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {loading ? "PROCESSING..." : "REGISTER NOW"}
          </button>
        </form>

        <div style={footerLinkStyle}>
          <span style={{ opacity: 0.5 }}>Already have an Account?</span>
          <button onClick={() => navigate("/login")} style={textButtonStyle}>
            Sign in.
          </button>
        </div>
      </div>
    </div>
  );
}

function RequirementItem({ label, met }: { label: string; met: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 12 }}>{met ? "✅" : "❌"}</span>
      <span style={{ fontFamily: sans, fontSize: 11, color: met ? "#00d4ff" : "rgba(255,255,255,0.4)" }}>
        {label}
      </span>
    </div>
  );
}

// --- Styles ---
const containerStyle: React.CSSProperties = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#04060c", padding: "40px 20px", position: "relative", overflow: "hidden" };
const cardStyle: React.CSSProperties = { width: "100%", maxWidth: 480, padding: "40px", background: "rgba(10, 15, 28, 0.85)", backdropFilter: "blur(24px)", border: "1px solid rgba(0, 180, 255, 0.15)", borderRadius: 24, boxShadow: "0 40px 100px rgba(0, 0, 0, 0.8)", zIndex: 10 };
const checklistStyle: React.CSSProperties = { background: "rgba(255, 255, 255, 0.03)", padding: "12px", borderRadius: 12, marginTop: 4 };
const titleStyle: React.CSSProperties = { fontFamily: serif, fontSize: 28, color: "#e0f0ff", letterSpacing: "-0.02em", marginBottom: 4 };
const subtitleStyle: React.CSSProperties = { fontFamily: mono, fontSize: 9, textTransform: "uppercase", color: "#00d4ff", letterSpacing: "0.2em", opacity: 0.8 };
const inputGroupStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const labelStyle: React.CSSProperties = { fontFamily: mono, fontSize: 9, fontWeight: 600, color: "rgba(0, 180, 255, 0.6)", letterSpacing: "0.1em" };
const inputStyle: React.CSSProperties = { width: "100%", height: 42, padding: "0 14px", background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(0, 180, 255, 0.15)", borderRadius: 10, color: "#ffffff", fontSize: 14, fontFamily: sans, outline: "none" };
const buttonStyle: React.CSSProperties = { marginTop: 8, height: 50, background: "#00d4ff", border: "none", borderRadius: 10, color: "#04060c", fontSize: 12, fontFamily: mono, fontWeight: 700, letterSpacing: "0.1em" };
const buttonHoverStyle: React.CSSProperties = { background: "#ffffff", transform: "translateY(-2px)", boxShadow: "0 10px 25px rgba(0, 212, 255, 0.4)" };
const errorStyle: React.CSSProperties = { padding: "10px 14px", background: "rgba(255, 80, 80, 0.08)", border: "1px solid rgba(255, 80, 80, 0.2)", borderRadius: 8, color: "#ff8080", fontSize: 12, fontFamily: sans };
const footerLinkStyle: React.CSSProperties = { marginTop: 24, textAlign: "center", fontFamily: sans, fontSize: 13, color: "#e0f0ff" };
const textButtonStyle: React.CSSProperties = { background: "none", border: "none", color: "#00d4ff", fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer", marginLeft: 6, padding: 0 };
const glowTopStyle: React.CSSProperties = { position: "absolute", top: "-10%", left: "30%", width: "40vw", height: "40vw", background: "radial-gradient(circle, rgba(0, 114, 255, 0.15) 0%, transparent 70%)", filter: "blur(60px)", pointerEvents: "none" };
const glowBottomStyle: React.CSSProperties = { position: "absolute", bottom: "-10%", right: "20%", width: "50vw", height: "50vw", background: "radial-gradient(circle, rgba(0, 212, 255, 0.1) 0%, transparent 70%)", filter: "blur(80px)", pointerEvents: "none" };