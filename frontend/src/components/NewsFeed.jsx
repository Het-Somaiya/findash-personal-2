import { useState, useEffect } from "react";

const glass = {
  background: "rgba(8, 20, 36, 0.55)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  border: "1px solid rgba(0, 180, 255, 0.14)",
};

function timeAgoLabel(refreshedAt) {
  if (!refreshedAt) return "";
  const diff = Math.floor((Date.now() - refreshedAt) / 1000);
  if (diff < 60) return "JUST NOW";
  if (diff < 3600) return `REFRESHED ${Math.floor(diff / 60)}M AGO`;
  return `REFRESHED ${Math.floor(diff / 3600)}H AGO`;
}

export default function NewsFeed() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/news/")
      .then((res) => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setArticles(data);
        setRefreshedAt(Date.now());
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 16,
          marginBottom: 22,
        }}
      >
        <h2
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 24,
            color: "#e0f0ff",
          }}
        >
          Market Intelligence
        </h2>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            color: "rgba(0,180,255,0.45)",
            letterSpacing: "0.08em",
          }}
        >
          {loading ? "LOADING..." : error ? "OFFLINE" : timeAgoLabel(refreshedAt)}
        </span>
      </div>

      {error && (
        <p style={{ color: "#ff5064", fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>
          Could not load news: {error}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {articles.map((n, i) => (
          <a
            key={n.id}
            href={n.url}
            target="_blank"
            rel="noopener noreferrer"
            className="news-item"
            style={{
              ...glass,
              textDecoration: "none",
              borderRadius:
                i === 0
                  ? "16px 16px 8px 8px"
                  : i === articles.length - 1
                  ? "8px 8px 16px 16px"
                  : 8,
              padding: i === 0 ? "20px 22px" : "15px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              borderColor:
                i === 0
                  ? "rgba(0,180,255,0.24)"
                  : "rgba(0,180,255,0.1)",
              background:
                i === 0
                  ? "rgba(0,28,58,0.65)"
                  : "rgba(8,20,36,0.45)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: "rgba(180,210,255,0.32)",
                  letterSpacing: "0.05em",
                }}
              >
                {n.source}
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: "rgba(180,210,255,0.22)",
                }}
              >
                ·
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  color: "rgba(180,210,255,0.32)",
                }}
              >
                {n.time}
              </span>
              {n.tickers.length > 0 && (
                <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
                  {n.tickers.map((t) => (
                    <span
                      key={t}
                      className="tag-pill"
                      style={{
                        background: "rgba(0,180,255,0.09)",
                        border: "1px solid rgba(0,180,255,0.18)",
                        borderRadius: 4,
                        padding: "1px 7px",
                        fontSize: 10,
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "rgba(0,180,255,0.75)",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p
              style={{
                fontFamily:
                  i === 0
                    ? "'DM Serif Display', serif"
                    : "'DM Sans', sans-serif",
                fontSize: i === 0 ? 19 : 14,
                color:
                  i === 0 ? "#eaf4ff" : "rgba(180,210,255,0.75)",
                lineHeight: 1.45,
                margin: 0,
              }}
            >
              {n.headline}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
}
