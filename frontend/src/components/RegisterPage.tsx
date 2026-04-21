import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

const serif = "'DM Serif Display', serif";
const sans = "'DM Sans', sans-serif";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await register(email, name, password);
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 42,
    padding: "0 14px",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(0,180,255,0.18)",
    borderRadius: 10,
    color: "#e0f0ff",
    fontSize: 14,
    fontFamily: sans,
    outline: "none",
    marginBottom: 18,
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: sans,
    fontSize: 12,
    color: "rgba(180,210,255,0.5)",
    display: "block",
    marginBottom: 6,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgb(8,10,16)",
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 400,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(0,180,255,0.12)",
          borderRadius: 16,
          padding: "48px 36px",
          backdropFilter: "blur(20px)",
        }}
      >
        <Link
          to="/"
          style={{
            fontFamily: serif,
            fontSize: 20,
            color: "#e0f0ff",
            textDecoration: "none",
            display: "block",
            marginBottom: 32,
            textAlign: "center",
          }}
        >
          FinDash
        </Link>

        <h1
          style={{
            fontFamily: serif,
            fontSize: 28,
            color: "#e0f0ff",
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          Create account
        </h1>
        <p
          style={{
            fontFamily: sans,
            fontSize: 14,
            color: "rgba(180,210,255,0.45)",
            marginBottom: 32,
            textAlign: "center",
          }}
        >
          Free access to watchlists, strategy tools, and AI insights
        </p>

        {error && (
          <div
            style={{
              fontFamily: sans,
              fontSize: 13,
              color: "#ff6b6b",
              background: "rgba(255,107,107,0.08)",
              border: "1px solid rgba(255,107,107,0.2)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        <label style={labelStyle}>Name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />

        <label style={labelStyle}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />

        <label style={labelStyle}>Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />

        <label style={labelStyle}>Confirm password</label>
        <input
          type="password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          style={{ ...inputStyle, marginBottom: 28 }}
        />

        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            height: 44,
            borderRadius: 10,
            background: "rgba(0,180,255,0.18)",
            border: "1px solid rgba(0,180,255,0.38)",
            color: "#00d4ff",
            fontFamily: sans,
            fontSize: 15,
            fontWeight: 500,
            cursor: submitting ? "wait" : "pointer",
            opacity: submitting ? 0.6 : 1,
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) =>
            !submitting &&
            (e.currentTarget.style.background = "rgba(0,180,255,0.30)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "rgba(0,180,255,0.18)")
          }
        >
          {submitting ? "Creating account..." : "Create account"}
        </button>

        <p
          style={{
            fontFamily: sans,
            fontSize: 13,
            color: "rgba(180,210,255,0.4)",
            textAlign: "center",
            marginTop: 24,
          }}
        >
          Already have an account?{" "}
          <Link
            to="/login"
            style={{ color: "#00d4ff", textDecoration: "none" }}
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
