import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "bot" | "user";
  text: string;
}

const INITIAL: Message[] = [
  {
    role: "bot",
    text: "Ask me anything about markets, options, or a specific ticker. I can explain concepts, interpret what you see on the surface, or walk you through platform features. This is not financial advice.",
  },
];

const QUICK = ["What is this surface?", "Explain GEX", "What's IV percentile?", "Why is VIX falling?"];

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? "";

async function getReply(
  question: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/api/chat/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: question, history }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.reply ?? "Sorry, I couldn't generate a response.";
  } catch {
    return "I'm having trouble connecting to the server. Please try again in a moment.";
  }
}

const sans = "'DM Sans', sans-serif";
const mono = "'JetBrains Mono', monospace";

export function Chatbot() {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<Message[]>(INITIAL);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [pulse,    setPulse]    = useState(true);
  const bottomRef              = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 10000);
    return () => clearTimeout(t);
  }, []);

  const send = async (q?: string) => {
    const text = (q ?? input).trim();
    if (!text || loading) return;
    setInput("");
    const updated: Message[] = [...messages, { role: "user", text }];
    setMessages(updated);
    setLoading(true);

    // Build history for GPT (map bot→assistant)
    const history = updated
      .filter(m => m.role === "user" || m.role === "bot")
      .map(m => ({
        role: (m.role === "bot" ? "assistant" : "user") as "user" | "assistant",
        content: m.text,
      }));

    const reply = await getReply(text, history);
    setMessages(m => [...m, { role: "bot", text: reply }]);
    setLoading(false);
  };

  const glass = {
    background: "rgba(8,18,32,0.97)",
    border: "1px solid rgba(0,180,255,0.20)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  };

  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 1000 }}>

      {/* Chat window */}
      {open && (
        <div style={{
          position: "absolute", bottom: 68, right: 0, width: 344,
          ...glass, borderRadius: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,0.65)",
          overflow: "hidden",
          display: "flex", flexDirection: "column",
          animation: "fadeUp 0.22s ease both",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px",
            borderBottom: "1px solid rgba(0,180,255,0.10)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div
              className="dot-pulse"
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "#00d4ff", boxShadow: "0 0 6px #00d4ff",
              }}
            />
            <span style={{ fontFamily: sans, fontSize: 13, color: "#e0f0ff", fontWeight: 500 }}>
              FinDash AI
            </span>
            <span style={{
              marginLeft: "auto", fontFamily: mono, fontSize: 10,
              color: "rgba(255,255,255,0.28)", letterSpacing: "0.06em",
            }}>
              FREE TIER
            </span>
          </div>

          {/* Messages */}
          <div style={{
            height: 270, overflowY: "auto",
            padding: "14px 16px",
            display: "flex", flexDirection: "column", gap: 10,
            scrollbarWidth: "thin",
            scrollbarColor: "rgba(0,180,255,0.2) transparent",
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "82%", padding: "9px 13px",
                  borderRadius: m.role === "user"
                    ? "12px 12px 3px 12px"
                    : "12px 12px 12px 3px",
                  background: m.role === "user"
                    ? "rgba(0,180,255,0.20)"
                    : "rgba(255,255,255,0.05)",
                  border: `1px solid ${m.role === "user" ? "rgba(0,180,255,0.30)" : "rgba(255,255,255,0.08)"}`,
                  fontSize: 12.5, color: "#cce4ff",
                  fontFamily: sans, lineHeight: 1.55,
                }}>
                  {m.role === "bot" ? (
                    <div className="chatbot-md">
                      <ReactMarkdown>{m.text}</ReactMarkdown>
                    </div>
                  ) : (
                    m.text
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div style={{ display: "flex", gap: 5, padding: "6px 2px", alignItems: "center" }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "#00d4ff",
                    animation: `typing-bounce 1.2s ${i * 0.18}s infinite`,
                  }} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick prompts — show on first view */}
          {messages.length <= 2 && !loading && (
            <div style={{ padding: "4px 14px 10px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {QUICK.map(q => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  style={{
                    background: "rgba(0,180,255,0.07)",
                    border: "1px solid rgba(0,180,255,0.15)",
                    borderRadius: 5, padding: "3px 9px",
                    fontSize: 11, fontFamily: sans,
                    color: "rgba(0,180,255,0.65)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "rgba(0,180,255,0.16)";
                    e.currentTarget.style.color = "#00d4ff";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "rgba(0,180,255,0.07)";
                    e.currentTarget.style.color = "rgba(0,180,255,0.65)";
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: "10px 14px",
            borderTop: "1px solid rgba(0,180,255,0.10)",
            display: "flex", gap: 8,
          }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && send()}
              placeholder="Ask about any ticker or concept..."
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(0,180,255,0.15)",
                borderRadius: 8, padding: "8px 12px",
                color: "#e0f0ff", fontSize: 12.5,
                fontFamily: sans, outline: "none",
                transition: "border-color 0.2s",
              }}
              onFocus={e => (e.target.style.borderColor = "rgba(0,180,255,0.45)")}
              onBlur={e  => (e.target.style.borderColor = "rgba(0,180,255,0.15)")}
            />
            <button
              onClick={() => send()}
              style={{
                background: "rgba(0,180,255,0.20)",
                border: "1px solid rgba(0,180,255,0.30)",
                borderRadius: 8, padding: "8px 13px",
                color: "#00d4ff", cursor: "pointer", fontSize: 15,
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,180,255,0.32)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(0,180,255,0.20)")}
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* Trigger button */}
      <div style={{ position: "relative" }}>
        {/* Pulse ring */}
        {pulse && !open && (
          <div style={{
            position: "absolute", inset: -4, borderRadius: "50%",
            border: "1px solid rgba(0,212,255,0.45)",
            animation: "badge-glow 2s infinite",
            pointerEvents: "none",
          }} />
        )}
        {/* Notification badge */}
        {!open && (
          <div style={{
            position: "absolute", top: -4, right: -4,
            width: 16, height: 16, borderRadius: "50%",
            background: "#ff5064", border: "2px solid #030d1a",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: sans, fontSize: 9, color: "#fff", fontWeight: 700,
            zIndex: 1,
          }}>1</div>
        )}
        <button
          onClick={() => { setOpen(o => !o); setPulse(false); }}
          style={{
            width: 52, height: 52, borderRadius: "50%",
            background: open ? "rgba(0,180,255,0.30)" : "rgba(0,180,255,0.15)",
            border: "1px solid rgba(0,180,255,0.40)",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 20px rgba(0,180,255,0.25)",
            backdropFilter: "blur(10px)",
            fontSize: 20, color: "#00d4ff",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 0 30px rgba(0,180,255,0.45)")}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 0 20px rgba(0,180,255,0.25)")}
        >
          {open ? "×" : "✦"}
        </button>
      </div>
    </div>
  );
}
