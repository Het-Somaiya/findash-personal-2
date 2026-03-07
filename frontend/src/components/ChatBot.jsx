import { useState, useRef, useEffect } from "react";

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: "bot",
      text: "Ask me anything about markets, options, or a specific ticker. I can search for current information.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system:
            "You are FinDash's market intelligence assistant on the free tier. Answer concisely in 2–4 sentences. Focus on financial markets, options, and investment concepts. Always end with: 'This is not financial advice.'",
          messages: [{ role: "user", content: q }],
        }),
      });
      const data = await res.json();
      const text =
        data.content?.find((b) => b.type === "text")?.text ||
        "Unable to respond right now.";
      setMessages((m) => [...m, { role: "bot", text }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "bot", text: "Connection error. Please try again." },
      ]);
    }
    setLoading(false);
  };

  const glass = {
    background: "rgba(8, 18, 32, 0.95)",
    border: "1px solid rgba(0, 180, 255, 0.2)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  };

  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 1000 }}>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: 68,
            right: 0,
            width: 340,
            ...glass,
            borderRadius: 16,
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid rgba(0,180,255,0.1)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#00d4ff",
                boxShadow: "0 0 6px #00d4ff",
                animation: "pulse 2s infinite",
              }}
            />
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                color: "#e0f0ff",
                fontWeight: 500,
              }}
            >
              FinDash AI
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 10,
                color: "rgba(255,255,255,0.3)",
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.06em",
              }}
            >
              FREE TIER
            </span>
          </div>

          {/* Messages */}
          <div
            style={{
              height: 260,
              overflowY: "auto",
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {messages.map((m, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "82%",
                    padding: "9px 13px",
                    borderRadius:
                      m.role === "user"
                        ? "12px 12px 3px 12px"
                        : "12px 12px 12px 3px",
                    background:
                      m.role === "user"
                        ? "rgba(0,180,255,0.2)"
                        : "rgba(255,255,255,0.05)",
                    border: `1px solid ${
                      m.role === "user"
                        ? "rgba(0,180,255,0.3)"
                        : "rgba(255,255,255,0.08)"
                    }`,
                    fontSize: 12.5,
                    color: "#cce4ff",
                    fontFamily: "'DM Sans', sans-serif",
                    lineHeight: 1.5,
                  }}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", gap: 4, padding: "8px 0" }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#00d4ff",
                      animation: `pulse 1.2s ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid rgba(0,180,255,0.1)",
              display: "flex",
              gap: 8,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask about any ticker..."
              className="search-input"
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(0,180,255,0.15)",
                borderRadius: 8,
                padding: "8px 12px",
                color: "#e0f0ff",
                fontSize: 12.5,
                fontFamily: "'DM Sans', sans-serif",
                outline: "none",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
            />
            <button
              onClick={send}
              style={{
                background: "rgba(0,180,255,0.2)",
                border: "1px solid rgba(0,180,255,0.3)",
                borderRadius: 8,
                padding: "8px 12px",
                color: "#00d4ff",
                cursor: "pointer",
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background 0.2s",
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: open
            ? "rgba(0,180,255,0.3)"
            : "rgba(0,180,255,0.15)",
          border: "1px solid rgba(0,180,255,0.4)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 20px rgba(0,180,255,0.25)",
          backdropFilter: "blur(10px)",
          fontSize: 20,
          color: "#00d4ff",
          transition: "all 0.2s",
          animation: "pulseGlow 3s infinite",
        }}
      >
        {open ? "×" : "✦"}
      </button>
    </div>
  );
}
