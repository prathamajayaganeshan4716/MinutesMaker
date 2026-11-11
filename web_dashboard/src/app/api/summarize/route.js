import { requireAccount, accessResponse } from "@/lib/server-access";
// Meeting minutes from a transcript ("Speaker: text" lines).
// Summary: Hugging Face summarisation model when credits allow, otherwise a local extractive summary.
// Decisions / action items / conclusion: extracted from the transcript itself so they always quote real speech.
export const runtime = "nodejs";
export const maxDuration = 60;

const STOP = new Set(
  "a an the and or but if then so of to in on at by for with from as is are was were be been being it its this that these those i you he she we they me him her us them my your our their do does did have has had will would can could should may might just very really okay ok yeah yes no not also about into over than too there here what which who whom when where why how all any each few more most other some such only own same s t don now um uh like know think going get got gonna wanna let lets".split(" "),
);

function lines(transcript) {
  return transcript
    .split("\n")
    .map((l) => {
      const m = l.match(/^([^:]{1,40}):\s*(.*)$/);
      const clean = (t) => t.replace(/[\u{1F4DD}\u{1F4CC}]\s*/gu, "").replace(/^(note|decision|action)\s*:\s*/i, "").trim();
      return m ? { speaker: m[1].trim(), text: clean(m[2]) } : { speaker: "", text: clean(l) };
    })
    .filter((l) => l.text);
}

function sentences(ls) {
  const out = [];
  for (const l of ls) {
    for (const s of l.text.split(/(?<=[.!?])\s+/)) {
      const t = s.trim();
      if (t.split(/\s+/).length >= 4) out.push({ speaker: l.speaker, text: t });
    }
  }
  return out;
}

function extractive(sents, n) {
  const freq = new Map();
  for (const s of sents)
    for (const w of s.text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []) if (!STOP.has(w) && w.length > 2) freq.set(w, (freq.get(w) || 0) + 1);
  const scored = sents.map((s, i) => {
    const ws = (s.text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || []).filter((w) => !STOP.has(w));
    const score = ws.reduce((a, w) => a + (freq.get(w) || 0), 0) / Math.sqrt(ws.length + 1);
    return { i, s, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s.text);
}

const DECISION = /\b(agreed|agree|decided|decide|decision|approved|approve|finali[sz]ed|confirmed|resolved|we('ll| will) go with|settled on|chose|choose to)\b/i;
const ACTION = /\b(will|i'll|we'll|he'll|she'll|they'll|going to|need to|needs to|have to|has to|must|should|action item|follow up|take care of|assign(ed)?|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|next week|end of (the )?(day|week)))\b/i;

async function hfSummary(text) {
  const token = process.env.HF_TOKEN;
  if (!token) throw new Error("no token");
  const model = process.env.HF_SUMMARY_MODEL || "facebook/bart-large-cnn";
  const r = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "x-wait-for-model": "true" },
    body: JSON.stringify({ inputs: text.slice(-3500), parameters: { max_length: 180, min_length: 40 } }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`HF ${r.status}`);
  const j = await r.json();
  const t = (Array.isArray(j) ? j[0]?.summary_text || j[0]?.generated_text : "") || "";
  if (t.trim().length < 20) throw new Error("empty");
  return t.trim();
}

export async function POST(request) {
  try { await requireAccount(request, { staff: true }); } catch (error) { return accessResponse(error); }
  const { transcript = "" } = await request.json().catch(() => ({}));
  const ls = lines(transcript);
  const sents = sentences(ls);
  const words = ls.reduce((a, l) => a + l.text.split(/\s+/).length, 0);
  if (words < 12) {
    return Response.json({
      summary: "Not enough discussion was captured to write a summary.",
      decisions: "None recorded.",
      actionItems: "None assigned.",
      conclusion: "The meeting ended without substantial recorded discussion.",
      source: "auto",
    });
  }
  const speakers = [...new Set(ls.map((l) => l.speaker).filter(Boolean))];
  let summary, source = "auto";
  try {
    summary = await hfSummary(ls.map((l) => l.text).join(" "));
    source = "huggingface";
  } catch {
    const key = extractive(sents, Math.min(5, Math.max(2, Math.round(sents.length / 6))));
    summary = `${speakers.length ? `${speakers.join(", ")} discussed the following. ` : ""}${key.join(" ")}`;
  }
  const decisions = sents.filter((s) => DECISION.test(s.text)).slice(0, 8);
  const actions = sents.filter((s) => ACTION.test(s.text) && !DECISION.test(s.text)).slice(0, 10);
  const used = new Set([...decisions, ...actions].map((x) => x.text));
  const tail = sents.slice(-4).filter((s) => !used.has(s.text)).map((s) => s.text);
  const conclusion = tail.length
    ? tail.slice(-2).join(" ")
    : `The meeting closed with ${decisions.length} decision${decisions.length === 1 ? "" : "s"} and ${actions.length} action item${actions.length === 1 ? "" : "s"} agreed${speakers.length ? ` between ${speakers.join(", ")}` : ""}.`;
  return Response.json({
    summary,
    decisions: decisions.length ? decisions.map((d) => `â€¢ ${d.text}`).join("\n") : "No explicit decisions were recorded.",
    actionItems: actions.length ? actions.map((a) => `â€¢ ${a.speaker ? `${a.speaker} â€” ` : ""}${a.text}`).join("\n") : "No action items were assigned.",
    conclusion,
    source,
    stats: { words, speakers: speakers.length, sentences: sents.length },
  });
}
