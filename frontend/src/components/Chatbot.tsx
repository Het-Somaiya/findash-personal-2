import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "../lib/AuthContext";

interface Message {
  role: "bot" | "user";
  text: string;
  citations?: Citation[];
}

interface Citation {
  id: string;
  ticker?: string;
  period?: string;
  section?: string;
  conceptId?: string;
  framing?: string;
  evidence?: string;
  sourceUrl?: string;
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
  accessToken: string | null,
): Promise<{ reply: string; citations: Citation[] }> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const res = await fetch(`${API_BASE}/api/chat/`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: question, history }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      reply: data.reply ?? "Sorry, I couldn't generate a response.",
      citations: Array.isArray(data.citations) ? data.citations : [],
    };
  } catch {
    return {
      reply: "I'm having trouble connecting to the server. Please try again in a moment.",
      citations: [],
    };
  }
}

const sans = "'DM Sans', sans-serif";
const mono = "'JetBrains Mono', monospace";

export function Chatbot() {
  const { accessToken } = useAuth();
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<Message[]>(INITIAL);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [pulse,    setPulse]    = useState(true);
  const [openCitation, setOpenCitation] = useState<string | null>(null);
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

    const { reply, citations } = await getReply(text, history, accessToken);
    setMessages(m => [...m, { role: "bot", text: reply, citations }]);
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
              {accessToken ? "FILING GRAPH" : "FREE TIER"}
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
                      <CitationMarkdown
                        messageIndex={i}
                        text={m.text}
                        citations={m.citations ?? []}
                        openCitation={openCitation}
                        setOpenCitation={setOpenCitation}
                      />
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

function CitationMarkdown({
  messageIndex,
  text,
  citations,
  openCitation,
  setOpenCitation,
}: {
  messageIndex: number;
  text: string;
  citations: Citation[];
  openCitation: string | null;
  setOpenCitation: (key: string | null) => void;
}) {
  const citationById = new Map(citations.map(c => [c.id, c]));
  const markdown = text.replace(/\[CITATION_(\d+)\]/g, (_match, n: string) => {
    const id = `CITATION_${n}`;
    return citationById.has(id) ? `[[${n}]](citation:${id})` : "";
  });
  const activeKey = openCitation?.startsWith(`${messageIndex}:`) ? openCitation : null;
  const activeId = activeKey?.split(":")[1];
  const activeCitation = activeId ? citationById.get(activeId) : undefined;

  return (
    <>
      <ReactMarkdown
        urlTransform={chatbotUrlTransform}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("citation:")) {
              const id = href.slice("citation:".length);
              const key = `${messageIndex}:${id}`;
              return (
                <button
                  type="button"
                  onClick={() => setOpenCitation(openCitation === key ? null : key)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 18,
                    height: 18,
                    margin: "0 2px",
                    padding: "0 5px",
                    borderRadius: 5,
                    border: "1px solid rgba(0,180,255,0.34)",
                    background: openCitation === key ? "rgba(0,180,255,0.24)" : "rgba(0,180,255,0.12)",
                    color: "#00d4ff",
                    cursor: "pointer",
                    fontFamily: mono,
                    fontSize: 10,
                    lineHeight: 1,
                    verticalAlign: "baseline",
                  }}
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>

      {activeCitation && (
        <CitationCard citation={activeCitation} />
      )}
    </>
  );
}

function chatbotUrlTransform(url: string) {
  if (
    url.startsWith("citation:") ||
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("mailto:")
  ) {
    return url;
  }
  return "";
}

function CitationCard({ citation }: { citation: Citation }) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 11px",
        borderRadius: 8,
        border: "1px solid rgba(0,180,255,0.20)",
        background: "rgba(0,12,24,0.64)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 7,
        fontFamily: mono,
        fontSize: 10,
        color: "rgba(224,240,255,0.82)",
      }}>
        <span style={{ color: "#00d4ff", fontWeight: 700 }}>{citation.id}</span>
        <span>{citation.ticker || "N/A"}</span>
        <span style={{ color: "rgba(224,240,255,0.36)" }}>·</span>
        <span>{citation.period || "N/A"}</span>
      </div>

      <CitationLine label="Section" value={citation.section} />
      <CitationLine label="Concept" value={citation.conceptId} />
      <CitationLine label="Framing" value={citation.framing} />
      <CitationLine label="Evidence" value={citation.evidence} />

      {citation.sourceUrl && (
        <a
          href={citation.sourceUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "inline-block",
            marginTop: 7,
            color: "#00d4ff",
            fontFamily: mono,
            fontSize: 10,
            textDecoration: "none",
          }}
        >
          Open SEC source
        </a>
      )}
    </div>
  );
}

function CitationLine({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ marginTop: 5 }}>
      <span style={{
        display: "block",
        marginBottom: 2,
        fontFamily: mono,
        fontSize: 9,
        color: "rgba(0,212,255,0.56)",
        textTransform: "uppercase",
      }}>
        {label}
      </span>
      <span style={{
        display: "block",
        fontFamily: sans,
        fontSize: 11.5,
        lineHeight: 1.45,
        color: "rgba(224,240,255,0.82)",
      }}>
        {value}
      </span>
    </div>
  );
}
