import http from "node:http";

const port = Number(process.env.VERTEX_BRIDGE_PORT || 4000);
const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || "";
const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
const model = process.env.VERTEX_MODEL || "gemini-2.5-flash";
const minOutputTokens = Number(process.env.VERTEX_MIN_OUTPUT_TOKENS || 256);
const maxOutputTokens = Number(process.env.VERTEX_MAX_OUTPUT_TOKENS || 2048);
const mock = process.env.VERTEX_BRIDGE_MOCK === "1";

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") {
      return json(res, 200, { ok: true, project, location, model, mock });
    }
    if (req.method === "GET" && req.url === "/v1/models") {
      return json(res, 200, { object: "list", data: [{ id: `vertex-${model}`, object: "model", owned_by: "google-vertex" }] });
    }
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const body = await readBody(req);
      const prompt = extractChatPrompt(body);
      const text = await complete(prompt, body.max_completion_tokens || body.max_tokens || 256);
      return json(res, 200, {
        id: `chatcmpl_${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model || `vertex-${model}`,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: text } }],
      });
    }
    if (req.method === "POST" && req.url === "/v1/responses") {
      const body = await readBody(req);
      const prompt = extractResponsesPrompt(body);
      const text = await complete(prompt, body.max_output_tokens || body.max_completion_tokens || 256);
      return json(res, 200, responseObject(text, body.model || `vertex-${model}`));
    }
    return text(res, 404, "not found");
  } catch (err) {
    console.error(JSON.stringify({ at: new Date().toISOString(), component: "vertex-bridge", error: err instanceof Error ? err.message : String(err) }));
    return json(res, 500, { error: { message: err instanceof Error ? err.message : String(err), type: "vertex_bridge_error" } });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(JSON.stringify({ at: new Date().toISOString(), component: "vertex-bridge", message: "listening", port, project, location, model, minOutputTokens, maxOutputTokens, mock }));
});

async function complete(prompt, requestedTokens) {
  const clamped = Math.max(minOutputTokens, Math.min(Number(requestedTokens) || 256, maxOutputTokens));
  console.log(JSON.stringify({ at: new Date().toISOString(), component: "vertex-bridge", event: "prompt", length: prompt.length, requestedTokens, clamped }));
  if (mock) return "HOLD";
  if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required");
  const token = await metadataAccessToken();
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt || "Reply with exactly: HOLD" }] }],
      generationConfig: { maxOutputTokens: clamped, temperature: 0 },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Vertex generateContent failed ${response.status}: ${JSON.stringify(body).slice(0, 800)}`);
  const candidate = body.candidates?.[0];
  const out = candidate?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
  console.log(JSON.stringify({ at: new Date().toISOString(), component: "vertex-bridge", event: "response", length: out.length, finishReason: candidate?.finishReason }));
  if (!out) throw new Error(`Vertex returned empty text: ${JSON.stringify({ finishReason: candidate?.finishReason, promptFeedback: body.promptFeedback }).slice(0, 800)}`);
  return out;
}

async function metadataAccessToken() {
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`metadata token failed ${response.status}`);
  return body.access_token;
}

function extractChatPrompt(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const latest = [...messages].reverse().find((message) => message.role === "user" && message.content);
  if (latest) return stringifyContent(latest.content);
  return messages.map((message) => `${message.role}: ${stringifyContent(message.content)}`).join("\n");
}

function extractResponsesPrompt(body) {
  if (typeof body.input === "string") return body.input;
  if (Array.isArray(body.input)) {
    const latest = [...body.input].reverse().find((item) => item && typeof item === "object" && item.role === "user");
    if (latest) return stringifyContent(latest.content || latest.text || latest.input_text || "");
    return body.input.map((item) => typeof item === "string" ? item : stringifyContent(item.content || item.text || item.input_text || "")).join("\n");
  }
  return body.instructions || "Reply with exactly: HOLD";
}

function stringifyContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "string" ? part : (part.text || part.input_text || part.output_text || part.content || "")).join("\n");
  if (content && typeof content === "object") return content.text || content.input_text || content.output_text || JSON.stringify(content);
  return "";
}

function responseObject(value, modelName) {
  return {
    id: `resp_${Date.now()}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: modelName,
    output: [{ id: `msg_${Date.now()}`, type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: value }] }],
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function text(res, status, body) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}
