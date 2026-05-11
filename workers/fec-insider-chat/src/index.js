/**
 * FEC Insider — chat, feedback, subscribe (Ghost members).
 * All secrets must come from env (Wrangler secrets); never hardcode in source.
 */

const SYSTEM_PROMPT =
  "You are the FEC Insider assistant, a helpful AI that answers questions about the Family Entertainment Center industry based on today's curated news. You have access to the latest articles. Be concise, friendly, and informative. If asked something not covered in the articles, say so honestly but offer general FEC industry knowledge when helpful. Keep responses under 3 sentences unless the user asks for detail.";

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

const ipHits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  let entry = ipHits.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry = { count: 1, windowStart: now };
    ipHits.set(ip, entry);
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function pruneRateLimitMap() {
  const now = Date.now();
  for (const [ip, entry] of ipHits) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) ipHits.delete(ip);
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

function clientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function buildArticleContext(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return "";
  return articles
    .map((a, i) => {
      const title = a.title || "Untitled";
      const source = a.source ? ` (${a.source})` : "";
      const date = a.date ? ` — ${a.date}` : "";
      const summary = a.summary || a.description || a.content || "";
      const url = a.url ? `\nLink: ${a.url}` : "";
      return `Article ${i + 1}: ${title}${source}${date}\n${summary}${url}`;
    })
    .join("\n\n");
}

async function handleChat(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { message, articles, history } = body;
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return jsonResponse({ error: '"message" is required and must be a non-empty string' }, 400);
  }
  if (message.length > 4000) {
    return jsonResponse({ error: "Message too long (max 4000 characters)" }, 400);
  }
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not configured");
    return jsonResponse({ error: "Service misconfigured" }, 500);
  }
  const articleContext = buildArticleContext(articles);
  const systemPrompt = articleContext
    ? `${SYSTEM_PROMPT}\n\nHere are today's articles for reference:\n<articles>\n${articleContext}\n</articles>`
    : SYSTEM_PROMPT;
  const messages = [];
  if (Array.isArray(history)) {
    for (const h of history.slice(-6)) {
      if (h.role === "user" || h.role === "assistant") {
        messages.push({ role: h.role, content: String(h.content).slice(0, 2000) });
      }
    }
  }
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    messages.push({ role: "user", content: message.trim() });
  }
  try {
    const apiResponse = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });
    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error(`Anthropic API error ${apiResponse.status}: ${errText}`);
      if (apiResponse.status === 429) {
        return jsonResponse({ error: "AI service is busy — please try again shortly" }, 503);
      }
      return jsonResponse({ error: "Failed to get a response from the AI" }, 502);
    }
    const data = await apiResponse.json();
    const reply = data.content?.[0]?.text || "Sorry, I couldn't generate a response.";
    const hook = env.ZAPIER_CHAT_WEBHOOK;
    if (hook) {
      const chatLog = {
        type: "chat",
        timestamp: new Date().toISOString(),
        user_message: message.trim(),
        assistant_reply: reply,
        user_agent: request.headers.get("User-Agent") || "",
        page_url: request.headers.get("Referer") || "",
        source: "fec-insider-widget",
      };
      const zapPromise = fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatLog),
      }).catch((err) => console.error("Zapier chat webhook error:", err));
      if (ctx?.waitUntil) ctx.waitUntil(zapPromise);
    }
    return jsonResponse({ reply });
  } catch (err) {
    console.error("Chat handler error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

async function handleFeedback(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { message, email } = body;
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return jsonResponse({ error: '"message" is required and must be a non-empty string' }, 400);
  }
  if (message.length > 2000) {
    return jsonResponse({ error: "Feedback too long (max 2000 characters)" }, 400);
  }
  if (email && typeof email !== "string") {
    return jsonResponse({ error: '"email" must be a string if provided' }, 400);
  }
  const payload = {
    type: "feedback",
    timestamp: new Date().toISOString(),
    message: message.trim(),
    email: email?.trim() || null,
    user_agent: request.headers.get("User-Agent") || "",
    page_url: request.headers.get("Referer") || "",
    source: "fec-insider-widget",
  };
  const hook = env.ZAPIER_FEEDBACK_WEBHOOK;
  if (hook) {
    try {
      const zapRes = await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!zapRes.ok) {
        console.error(`Zapier webhook failed: ${zapRes.status} ${await zapRes.text()}`);
      }
    } catch (err) {
      console.error("Zapier webhook error:", err);
    }
  }
  return jsonResponse({ success: true });
}

function hexToArrayBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}

function base64url(source) {
  let str;
  if (typeof source === "string") {
    str = btoa(source);
  } else {
    const bytes = new Uint8Array(source);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    str = btoa(binary);
  }
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateGhostJWT(keyId, secretHex) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT", kid: keyId };
  const payload = { iat: now, exp: now + 300, aud: "/admin/" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const keyData = hexToArrayBuffer(secretHex);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(signature)}`;
}

async function handleSubscribe(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const { email, name } = body;
  if (!email || typeof email !== "string") {
    return jsonResponse({ error: '"email" is required' }, 400);
  }
  const emailTrimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    return jsonResponse({ error: "Invalid email address" }, 400);
  }
  const ghostUrl = env.GHOST_URL;
  const keyId = env.GHOST_ADMIN_KEY_ID;
  const secretHex = env.GHOST_ADMIN_KEY_SECRET;
  if (!ghostUrl || !keyId || !secretHex) {
    console.error("Ghost env not configured");
    return jsonResponse({ error: "Service misconfigured" }, 500);
  }
  let token;
  try {
    token = await generateGhostJWT(keyId, secretHex);
  } catch (err) {
    console.error("JWT generation error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
  const memberData = { email: emailTrimmed };
  if (name && typeof name === "string" && name.trim()) {
    memberData.name = name.trim();
  }
  try {
    const ghostRes = await fetch(`${ghostUrl.replace(/\/$/, "")}/ghost/api/admin/members/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Ghost ${token}`,
      },
      body: JSON.stringify({ members: [memberData] }),
    });
    if (!ghostRes.ok) {
      const errBody = await ghostRes.text();
      console.error(`Ghost API error ${ghostRes.status}: ${errBody}`);
      if (ghostRes.status === 422) {
        let parsed;
        try {
          parsed = JSON.parse(errBody);
        } catch {
          /* ignore */
        }
        const msg = parsed?.errors?.[0]?.message || "Validation error, cannot save member.";
        return jsonResponse({ error: msg }, 422);
      }
      return jsonResponse({ error: "Failed to subscribe. Please try again." }, 502);
    }
    const data = await ghostRes.json();
    const member = data.members?.[0];
    const resolvedEmail = member?.email || emailTrimmed;
    const resolvedName = member?.name || memberData.name || null;
    const hook = env.ZAPIER_SUBSCRIBE_WEBHOOK;
    if (hook) {
      const zapPayload = {
        type: "subscribe",
        timestamp: new Date().toISOString(),
        email: resolvedEmail,
        name: resolvedName,
        user_agent: request.headers.get("User-Agent") || "",
        page_url: request.headers.get("Referer") || "",
        source: "fec-insider-widget",
      };
      const zapPromise = fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zapPayload),
      }).catch((err) => console.error("Zapier subscribe webhook error:", err));
      if (ctx?.waitUntil) ctx.waitUntil(zapPromise);
    }
    return jsonResponse({
      success: true,
      message: "You're subscribed to FEC Insider!",
      member: { email: resolvedEmail },
    });
  } catch (err) {
    console.error("Subscribe handler error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }
    const ip = clientIP(request);
    if (isRateLimited(ip)) {
      pruneRateLimitMap();
      return jsonResponse({ error: "Too many requests — please wait a minute" }, 429);
    }
    if (Math.random() < 0.01) pruneRateLimitMap();
    if (path === "/chat") return handleChat(request, env, ctx);
    if (path === "/feedback") return handleFeedback(request, env);
    if (path === "/subscribe") return handleSubscribe(request, env, ctx);
    return jsonResponse({ error: "Not found" }, 404);
  },
};
