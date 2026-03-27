import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONFIG ───
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || "http://localhost:5678";

// ─── API HELPERS ───
const getToken = () => localStorage.getItem("ce_token");
const api = async (path, opts = {}) => {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...opts.headers,
    },
    body: opts.body ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body)) : undefined,
  });
  if (res.status === 401) { localStorage.removeItem("ce_token"); window.location.reload(); }
  return res.json();
};
const n8n = async (path, body) => {
  const res = await fetch(`${N8N_URL}/webhook/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
};

// ─── ICONS (inline SVG) ───
const Icon = ({ name, size = 20 }) => {
  const icons = {
    home: <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1"/>,
    edit: <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>,
    calendar: <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>,
    clock: <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>,
    folder: <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>,
    settings: <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>,
    plus: <path d="M12 4v16m8-8H4"/>,
    check: <path d="M5 13l4 4L19 7"/>,
    x: <path d="M6 18L18 6M6 6l12 12"/>,
    upload: <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>,
    image: <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>,
    doc: <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>,
    send: <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>,
    eye: <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>,
    refresh: <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>,
    building: <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>,
    logout: <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>,
    sparkles: <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {icons[name]}
    </svg>
  );
};

// ─── PLATFORM BADGES ───
const PLATFORMS = {
  x: { label: "X", color: "#0f172a", bg: "#f1f5f9" },
  instagram: { label: "Instagram", color: "#c026d3", bg: "#fae8ff" },
  linkedin: { label: "LinkedIn", color: "#0077b5", bg: "#dbeafe" },
  facebook: { label: "Facebook", color: "#1877f2", bg: "#dbeafe" },
  tiktok: { label: "TikTok", color: "#010101", bg: "#f1f5f9" },
  youtube: { label: "YouTube", color: "#ff0000", bg: "#fee2e2" },
};
const PlatformBadge = ({ platform }) => {
  const p = PLATFORMS[platform] || { label: platform, color: "#666", bg: "#eee" };
  return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, color: p.color, background: p.bg, marginRight: 4, marginBottom: 4 }}>{p.label}</span>;
};

const StatusBadge = ({ status }) => {
  const colors = {
    generating: { c: "#d97706", bg: "#fef3c7" }, pending_review: { c: "#7c3aed", bg: "#ede9fe" },
    approved: { c: "#2563eb", bg: "#dbeafe" }, scheduled: { c: "#0891b2", bg: "#cffafe" },
    publishing: { c: "#d97706", bg: "#fef3c7" }, published: { c: "#16a34a", bg: "#dcfce7" },
    failed: { c: "#dc2626", bg: "#fee2e2" }, rejected: { c: "#6b7280", bg: "#f3f4f6" },
  };
  const s = colors[status] || { c: "#666", bg: "#eee" };
  return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 99, fontSize: 12, fontWeight: 600, color: s.c, background: s.bg }}>{status?.replace("_", " ")}</span>;
};

// ─── LOGIN PAGE ───
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem("ce_token", data.token);
        onLogin(data.user);
      } else {
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Connection failed");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}>
      <form onSubmit={handleSubmit} style={{ background: "#fff", borderRadius: 16, padding: 40, width: 380, boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px" }}>Content Engine</div>
          <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 4 }}>Multi-brand social media automation</div>
        </div>
        {error && <div style={{ background: "#fee2e2", color: "#dc2626", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, marginBottom: 12, boxSizing: "border-box", outline: "none" }} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", padding: "12px 16px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, marginBottom: 20, boxSizing: "border-box", outline: "none" }} />
        <button type="submit" disabled={loading} style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.6 : 1 }}>
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}

// ─── SIDEBAR ───
function Sidebar({ activePage, setPage, businesses, activeBusiness, setActiveBusiness, onLogout }) {
  const navItems = [
    { id: "home", label: "Overview", icon: "home" },
    { id: "create", label: "Create Content", icon: "sparkles" },
    { id: "calendar", label: "Calendar", icon: "calendar" },
    { id: "history", label: "History", icon: "clock" },
    { id: "vault", label: "Context Vault", icon: "folder" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];

  return (
    <div style={{ width: 260, minHeight: "100vh", background: "#0f172a", color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ padding: "24px 20px 16px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.3px" }}>Content Engine</div>
      </div>

      {/* Business Selector */}
      <div style={{ padding: "12px 16px" }}>
        <select
          value={activeBusiness?.id || ""}
          onChange={(e) => {
            const biz = businesses.find((b) => b.id === e.target.value);
            setActiveBusiness(biz);
          }}
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #334155", background: "#1e293b", color: "#fff", fontSize: 13, outline: "none" }}
        >
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>{b.display_name}</option>
          ))}
        </select>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "8px 12px" }}>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 8,
              border: "none", background: activePage === item.id ? "#1e293b" : "transparent",
              color: activePage === item.id ? "#fff" : "#94a3b8", fontSize: 13, fontWeight: 500, cursor: "pointer",
              marginBottom: 2, textAlign: "left",
            }}
          >
            <Icon name={item.icon} size={18} />
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: "12px 16px", borderTop: "1px solid #1e293b" }}>
        <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", borderRadius: 8, border: "none", background: "transparent", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>
          <Icon name="logout" size={16} /> Sign Out
        </button>
      </div>
    </div>
  );
}

// ─── OVERVIEW PAGE ───
function OverviewPage({ business }) {
  if (!business) return <div style={{ padding: 40, color: "#94a3b8" }}>Select a business to get started.</div>;

  const stats = [
    { label: "Published", value: business.published_count || 0, color: "#16a34a", bg: "#dcfce7" },
    { label: "Scheduled", value: business.scheduled_count || 0, color: "#0891b2", bg: "#cffafe" },
    { label: "Pending Review", value: business.pending_count || 0, color: "#7c3aed", bg: "#ede9fe" },
    { label: "Context Docs", value: business.document_count || 0, color: "#d97706", bg: "#fef3c7" },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", margin: "0 0 8px" }}>{business.display_name}</h1>
      <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 32px" }}>{business.brand_voice || "No brand voice set"}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: "#fff", borderRadius: 12, padding: "20px 24px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 12, padding: 24, border: "1px solid #e2e8f0" }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", margin: "0 0 12px" }}>Connected Platforms</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(business.enabled_platforms || []).map((p) => <PlatformBadge key={p} platform={p} />)}
          {(!business.enabled_platforms || business.enabled_platforms.length === 0) && (
            <span style={{ fontSize: 13, color: "#94a3b8" }}>No platforms configured. Go to Settings to connect platforms.</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CREATE CONTENT PAGE ───
function CreatePage({ business, onContentCreated }) {
  const [brief, setBrief] = useState("");
  const [platforms, setPlatforms] = useState(business?.enabled_platforms || []);
  const [generateImage, setGenerateImage] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [schedule, setSchedule] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setPlatforms(business?.enabled_platforms || []);
  }, [business]);

  const togglePlatform = (p) => {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  const handleGenerate = async () => {
    if (!brief.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      // 1. Create content record in DB
      const content = await api("/api/content", {
        method: "POST",
        body: { business_id: business.id, brief, scheduled_at: schedule || null },
      });

      // 2. Trigger n8n generation workflow
      const genResult = await n8n("generate-content", {
        business_id: business.id,
        content_id: content.id,
        brief,
        platforms,
        generate_image: generateImage,
        image_prompt: imagePrompt || null,
        schedule: schedule || null,
      });

      setResult(genResult);
      if (onContentCreated) onContentCreated();
    } catch (err) {
      setError("Generation failed. Check n8n is running and workflows are active.");
    }
    setLoading(false);
  };

  const handleApprove = async () => {
    if (!result?.content_id) return;
    setLoading(true);
    try {
      await api(`/api/content/${result.content_id}`, {
        method: "PUT",
        body: { status: schedule ? "scheduled" : "approved", variants: result.variants, image_url: result.image_url },
      });

      if (!schedule) {
        // Publish immediately
        await n8n("publish-content", { content_id: result.content_id, publish_now: true });
      }

      setResult(null);
      setBrief("");
      setImagePrompt("");
      setSchedule("");
      if (onContentCreated) onContentCreated();
    } catch {
      setError("Failed to approve content");
    }
    setLoading(false);
  };

  if (!business) return <div style={{ padding: 40, color: "#94a3b8" }}>Select a business first.</div>;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", margin: "0 0 24px" }}>Create Content</h1>

      {!result ? (
        <div style={{ maxWidth: 680 }}>
          {/* Brief */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Content Brief</label>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Post about our new spring gel polish range. Focus on seasonal colours. Tone: luxury but approachable."
              style={{ width: "100%", minHeight: 120, padding: "12px 16px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, resize: "vertical", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }}
            />
          </div>

          {/* Platforms */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 8 }}>Target Platforms</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.keys(PLATFORMS).map((p) => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  style={{
                    padding: "6px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer",
                    border: platforms.includes(p) ? "2px solid " + PLATFORMS[p].color : "2px solid #e2e8f0",
                    background: platforms.includes(p) ? PLATFORMS[p].bg : "#fff",
                    color: platforms.includes(p) ? PLATFORMS[p].color : "#94a3b8",
                  }}
                >
                  {PLATFORMS[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* Image Generation */}
          <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setGenerateImage(!generateImage)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative",
                background: generateImage ? "#16a34a" : "#e2e8f0", transition: "background 0.2s",
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 3,
                left: generateImage ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Generate AI Image (Nano Banana)</span>
          </div>

          {generateImage && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Custom Image Prompt (optional)</label>
              <input
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Leave blank to auto-generate from brief + brand context"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, boxSizing: "border-box", outline: "none" }}
              />
            </div>
          )}

          {/* Schedule */}
          <div style={{ marginBottom: 28 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Schedule (optional)</label>
            <input
              type="datetime-local"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              style={{ padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, outline: "none" }}
            />
          </div>

          {error && <div style={{ background: "#fee2e2", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <button
            onClick={handleGenerate}
            disabled={loading || !brief.trim()}
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 10, border: "none",
              background: "#0f172a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
              opacity: loading || !brief.trim() ? 0.5 : 1,
            }}
          >
            <Icon name="sparkles" size={18} />
            {loading ? "Generating..." : "Generate Content"}
          </button>
        </div>
      ) : (
        /* ─── RESULT PREVIEW ─── */
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0 }}>Generated Content</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setResult(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#64748b" }}>
                <Icon name="x" size={14} /> Discard
              </button>
              <button onClick={handleApprove} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.5 : 1 }}>
                <Icon name="check" size={14} /> {schedule ? "Approve & Schedule" : "Approve & Publish"}
              </button>
            </div>
          </div>

          {result.image_url && (
            <div style={{ marginBottom: 20 }}>
              <img src={result.image_url} alt="Generated" style={{ maxWidth: 400, borderRadius: 12, border: "1px solid #e2e8f0" }} />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            {result.variants && Object.entries(result.variants).filter(([k]) => k !== "image_prompt").map(([platform, variant]) => (
              <div key={platform} style={{ background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e2e8f0" }}>
                <PlatformBadge platform={platform} />
                <pre style={{ marginTop: 12, fontSize: 13, color: "#334155", whiteSpace: "pre-wrap", wordWrap: "break-word", fontFamily: "inherit", lineHeight: 1.6 }}>
                  {variant.text || variant.caption || variant.commentary || variant.message || variant.title || JSON.stringify(variant, null, 2)}
                </pre>
                {variant.hashtags && variant.hashtags.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#2563eb" }}>
                    {variant.hashtags.map((h) => `#${h}`).join(" ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CONTENT HISTORY PAGE ───
function HistoryPage({ business }) {
  const [content, setContent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business) return;
    setLoading(true);
    api(`/api/content?business_id=${business.id}&limit=50`).then((data) => {
      setContent(data.items || []);
      setLoading(false);
    });
  }, [business]);

  if (!business) return <div style={{ padding: 40, color: "#94a3b8" }}>Select a business.</div>;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", margin: "0 0 24px" }}>Content History</h1>
      {loading ? (
        <div style={{ color: "#94a3b8", fontSize: 14 }}>Loading...</div>
      ) : content.length === 0 ? (
        <div style={{ color: "#94a3b8", fontSize: 14 }}>No content yet. Create your first post!</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {content.map((c) => (
            <div key={c.id} style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>{c.brief?.substring(0, 100)}{c.brief?.length > 100 ? "..." : ""}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
              <StatusBadge status={c.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CALENDAR PAGE (simple list view) ───
function CalendarPage({ business }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  useEffect(() => {
    if (!business) return;
    setLoading(true);
    api(`/api/content/calendar/${business.id}?month=${month}`).then((data) => {
      setItems(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, [business]);

  if (!business) return <div style={{ padding: 40, color: "#94a3b8" }}>Select a business.</div>;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", margin: "0 0 8px" }}>Content Calendar</h1>
      <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px" }}>Scheduled and published content for {now.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>
      {loading ? (
        <div style={{ color: "#94a3b8" }}>Loading...</div>
      ) : items.length === 0 ? (
        <div style={{ color: "#94a3b8", fontSize: 14 }}>No scheduled or published content this month.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((c) => (
            <div key={c.id} style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{c.brief?.substring(0, 80)}</div>
                <StatusBadge status={c.status} />
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {c.scheduled_at ? `Scheduled: ${new Date(c.scheduled_at).toLocaleString("en-GB")}` : c.published_at ? `Published: ${new Date(c.published_at).toLocaleString("en-GB")}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CONTEXT VAULT PAGE ───
function VaultPage({ business }) {
  const [tab, setTab] = useState("documents");
  const [docs, setDocs] = useState([]);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef(null);
  const imgInputRef = useRef(null);

  const loadData = useCallback(() => {
    if (!business) return;
    setLoading(true);
    Promise.all([
      api(`/api/businesses/${business.id}/documents`),
      api(`/api/businesses/${business.id}/images`),
    ]).then(([d, i]) => {
      setDocs(Array.isArray(d) ? d : []);
      setImages(Array.isArray(i) ? i : []);
      setLoading(false);
    });
  }, [business]);

  useEffect(() => { loadData(); }, [loadData]);

  const uploadDoc = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    await fetch(`${API_URL}/api/uploads/document/${business.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });
    loadData();
  };

  const uploadImg = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("label", "reference");
    await fetch(`${API_URL}/api/uploads/image/${business.id}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });
    loadData();
  };

  const deleteDoc = async (docId) => {
    await api(`/api/businesses/${business.id}/documents/${docId}`, { method: "DELETE" });
    loadData();
  };

  const deleteImg = async (imgId) => {
    await api(`/api/businesses/${business.id}/images/${imgId}`, { method: "DELETE" });
    loadData();
  };

  if (!business) return <div style={{ padding: 40, color: "#94a3b8" }}>Select a business.</div>;

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", margin: "0 0 8px" }}>Context Vault</h1>
      <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 24px" }}>Upload business documents and reference images to inform content generation.</p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#f1f5f9", borderRadius: 10, padding: 4, width: "fit-content" }}>
        {["documents", "images"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: tab === t ? "#fff" : "transparent", color: tab === t ? "#0f172a" : "#64748b",
              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            <Icon name={t === "documents" ? "doc" : "image"} size={14} /> {t === "documents" ? "Documents" : "Images"}
          </button>
        ))}
      </div>

      {tab === "documents" ? (
        <div>
          <input type="file" ref={fileInputRef} onChange={uploadDoc} accept=".pdf,.docx,.txt" style={{ display: "none" }} />
          <button onClick={() => fileInputRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 8, border: "2px dashed #cbd5e1", background: "#f8fafc", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer", marginBottom: 16 }}>
            <Icon name="upload" size={16} /> Upload Document (PDF, DOCX, TXT)
          </button>
          {loading ? <div style={{ color: "#94a3b8" }}>Loading...</div> :
            docs.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 14 }}>No documents uploaded. Upload a business plan or brand guide to improve content quality.</div> :
            docs.map((d) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{d.filename}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{d.file_type?.toUpperCase()} · {(d.file_size_bytes / 1024).toFixed(0)} KB · {new Date(d.uploaded_at).toLocaleDateString("en-GB")}</div>
                </div>
                <button onClick={() => deleteDoc(d.id)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Delete</button>
              </div>
            ))
          }
        </div>
      ) : (
        <div>
          <input type="file" ref={imgInputRef} onChange={uploadImg} accept="image/*" style={{ display: "none" }} />
          <button onClick={() => imgInputRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 8, border: "2px dashed #cbd5e1", background: "#f8fafc", fontSize: 13, fontWeight: 600, color: "#64748b", cursor: "pointer", marginBottom: 16 }}>
            <Icon name="upload" size={16} /> Upload Reference Image
          </button>
          {loading ? <div style={{ color: "#94a3b8" }}>Loading...</div> :
            images.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 14 }}>No reference images. Upload logos, product shots, or mood boards.</div> :
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {images.map((img) => (
                <div key={img.id} style={{ background: "#fff", borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                  <img src={img.file_url} alt={img.label} style={{ width: "100%", aspectRatio: "1", objectFit: "cover" }} />
                  <div style={{ padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12, color: "#64748b" }}>{img.label || "reference"}</span>
                    <button onClick={() => deleteImg(img.id)} style={{ padding: "2px 8px", borderRadius: 4, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 11, cursor: "pointer" }}>×</button>
                  </div>
                </div>
              ))}
            </div>
          }
        </div>
      )}
    </div>
  );
}

// ─── SETTINGS PAGE ───
function SettingsPage({ business, onUpdate }) {
  const [name, setName] = useState(business?.display_name || "");
  const [voice, setVoice] = useState(business?.brand_voice || "");
  const [summary, setSummary] = useState(business?.brand_summary || "");
  const [platforms, setPlatforms] = useState(business?.enabled_platforms || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(business?.display_name || "");
    setVoice(business?.brand_voice || "");
    setSummary(business?.brand_summary || "");
    setPlatforms(business?.enabled_platforms || []);
  }, [business]);

  const togglePlatform = (p) => {
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  const handleSave = async () => {
    setSaving(true);
    await api(`/api/businesses/${business.id}`, {
      method: "PUT",
      body: { display_name: name, brand_voice: voice, brand_summary: summary, enabled_platforms: platforms },
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (onUpdate) onUpdate();
  };

  if (!business) return <div style={{ padding: 40, color: "#94a3b8" }}>Select a business.</div>;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", margin: "0 0 24px" }}>Business Settings</h1>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Business Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box", outline: "none" }} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Brand Voice</label>
        <textarea value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="Describe your brand's tone, personality, and target audience..." style={{ width: "100%", minHeight: 80, padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, resize: "vertical", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Brand Summary (auto-compiled from context vault, editable)</label>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="This summary is injected into every content generation prompt for this business..." style={{ width: "100%", minHeight: 100, padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, resize: "vertical", boxSizing: "border-box", outline: "none", fontFamily: "inherit" }} />
      </div>

      <div style={{ marginBottom: 28 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 8 }}>Enabled Platforms</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.keys(PLATFORMS).map((p) => (
            <button
              key={p}
              onClick={() => togglePlatform(p)}
              style={{
                padding: "8px 16px", borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: platforms.includes(p) ? "2px solid " + PLATFORMS[p].color : "2px solid #e2e8f0",
                background: platforms.includes(p) ? PLATFORMS[p].bg : "#fff",
                color: platforms.includes(p) ? PLATFORMS[p].color : "#94a3b8",
              }}
            >
              {PLATFORMS[p].label}
            </button>
          ))}
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 28px", borderRadius: 10, border: "none", background: saved ? "#16a34a" : "#0f172a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 0.3s" }}>
        {saved ? <><Icon name="check" size={16} /> Saved</> : saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

// ─── MAIN APP ───
export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("home");
  const [businesses, setBusinesses] = useState([]);
  const [activeBusiness, setActiveBusiness] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Check existing auth
  useEffect(() => {
    const token = getToken();
    if (token) {
      api("/api/auth/me").then((u) => {
        if (u.id) setUser(u);
        setAuthChecked(true);
      }).catch(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  const loadBusinesses = useCallback(() => {
    api("/api/businesses").then((data) => {
      const biz = Array.isArray(data) ? data : [];
      setBusinesses(biz);
      if (biz.length > 0 && !activeBusiness) setActiveBusiness(biz[0]);
      // Refresh active business data
      if (activeBusiness) {
        const updated = biz.find((b) => b.id === activeBusiness.id);
        if (updated) setActiveBusiness(updated);
      }
    });
  }, [activeBusiness]);

  useEffect(() => {
    if (user) loadBusinesses();
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem("ce_token");
    setUser(null);
    setBusinesses([]);
    setActiveBusiness(null);
  };

  if (!authChecked) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", color: "#94a3b8" }}>Loading...</div>;
  if (!user) return <LoginPage onLogin={setUser} />;

  const renderPage = () => {
    switch (page) {
      case "home": return <OverviewPage business={activeBusiness} />;
      case "create": return <CreatePage business={activeBusiness} onContentCreated={loadBusinesses} />;
      case "calendar": return <CalendarPage business={activeBusiness} />;
      case "history": return <HistoryPage business={activeBusiness} />;
      case "vault": return <VaultPage business={activeBusiness} />;
      case "settings": return <SettingsPage business={activeBusiness} onUpdate={loadBusinesses} />;
      default: return <OverviewPage business={activeBusiness} />;
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f8fafc", fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      <Sidebar
        activePage={page}
        setPage={setPage}
        businesses={businesses}
        activeBusiness={activeBusiness}
        setActiveBusiness={setActiveBusiness}
        onLogout={handleLogout}
      />
      <main style={{ flex: 1, padding: "32px 40px", overflowY: "auto" }}>
        {renderPage()}
      </main>
    </div>
  );
}
