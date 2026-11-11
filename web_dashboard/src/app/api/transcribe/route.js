import { requireAccount, accessResponse } from "@/lib/server-access";
// Speech-to-text for one short audio chunk.
// 1) Hugging Face Whisper (HF_TOKEN, HF_WHISPER_MODEL)  2) Minutes Maker speech server (SPEECH_URL + SPEECH_KEY).
// Secrets stay on the server; the browser only ever talks to this route.
export const runtime = "nodejs";
export const maxDuration = 60;

const BAD = ["thank you for watching", "subtitles by", "amara.org", "please subscribe"];
// Whisper invents these on silence / noise when they are the whole chunk.
const SILENCE = new Set(["you", "thank you", "thanks", "thank you very much", "bye", "so", "okay", "uh", "um", "hmm", "the end", "music"]);

function clean(text) {
  const t = (text || "").trim();
  if (t.length < 2) return "";
  const low = t.toLowerCase();
  if (BAD.some((b) => low.includes(b))) return "";
  if (SILENCE.has(low.replace(/[^\p{L}\s]/gu, "").trim())) return "";
  const words = low.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
  if (words.length >= 3 && new Set(words).size <= 2) return "";
  return t;
}

async function viaHuggingFace(buf, type) {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("no HF token");
  const model = process.env.HF_WHISPER_MODEL || "openai/whisper-large-v3-turbo";
  const r = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": type || "audio/webm", "x-wait-for-model": "true" },
    body: buf,
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`HF ${r.status}`);
  const j = await r.json();
  if (typeof j?.text !== "string") throw new Error("HF bad response");
  return j.text;
}

async function viaSpeechServer(buf, lang) {
  const url = process.env.SPEECH_URL;
  if (!url) throw new Error("no speech server");
  const r = await fetch(`${url.replace(/\/$/, "")}/transcribe`, {
    method: "POST",
    headers: { "X-Speech-Key": process.env.SPEECH_KEY || "", "Content-Type": "application/octet-stream", ...(lang ? { "x-language": lang } : {}) },
    body: buf,
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw new Error(`speech ${r.status}`);
  return (await r.json()).text || "";
}

export async function POST(request) {
  try { await requireAccount(request); } catch (error) { return accessResponse(error); }
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length < 1000) return Response.json({ text: "", engine: "none" });
  if (buf.length > 20 * 1024 * 1024) return Response.json({ error: "chunk too large" }, { status: 413 });
  const type = (request.headers.get("content-type") || "audio/webm").split(";")[0];
  const lang = request.headers.get("x-language") || "";
  const errors = [];
  for (const [engine, fn] of [["huggingface", () => viaHuggingFace(buf, type)], ["whisper-server", () => viaSpeechServer(buf, lang)]]) {
    try {
      return Response.json({ text: clean(await fn()), engine });
    } catch (e) {
      errors.push(`${engine}: ${e.message}`);
    }
  }
  return Response.json({ error: "transcription unavailable", details: errors }, { status: 503 });
}
