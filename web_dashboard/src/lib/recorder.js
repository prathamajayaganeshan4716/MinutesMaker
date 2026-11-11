"use client";
import fixWebmDuration from "fix-webm-duration";

/**
 * Records the whole meeting: every visible video tile is composited onto a 1280x720 canvas
 * and all audio (your mic + every participant) is mixed into one track.
 *
 * Reliability:
 * - a Web Worker clock keeps drawing even when the tab is in the background (timers there aren't throttled);
 * - every 1-second chunk is written to IndexedDB as it is produced, so closing the tab, a crash or
 *   a reload never loses the recording — unfinished recordings are recovered automatically;
 * - the final file gets its real duration written in, so players show the full length and can seek.
 */
export class MeetingRecorder {
  constructor({ getTiles, title, meetingId, userEmail, userUid, hostEmail, hostUid }) {
    this.userEmail = userEmail;
    this.userUid = userUid;
    this.hostEmail = hostEmail;
    this.hostUid = hostUid;
    this.getTiles = getTiles; // () => [{ video: HTMLVideoElement|null, name, videoOff }]
    this.title = title;
    this.meetingId = meetingId;
    this.id = `${meetingId || "rec"}-${Date.now()}`;
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.ctx = this.canvas.getContext("2d");
    this.audio = new (window.AudioContext || window.webkitAudioContext)();
    this.dest = this.audio.createMediaStreamDestination();
    // keep the mixed track alive even when nobody is talking
    const silent = this.audio.createConstantSource?.();
    if (silent) {
      const g = this.audio.createGain();
      g.gain.value = 0;
      silent.connect(g).connect(this.dest);
      silent.start();
    }
    this.sources = new Map();
    this.seq = 0;
    this.pending = Promise.resolve();
  }

  addAudio(key, stream) {
    const tracks = stream?.getAudioTracks() || [];
    if (!tracks.length) return;
    const tid = tracks.map((t) => t.id).join(",");
    if (this.sources.get(key)?.tid === tid) return;
    this.removeAudio(key);
    try {
      const src = this.audio.createMediaStreamSource(new MediaStream(tracks));
      src.connect(this.dest);
      this.sources.set(key, { src, tid });
    } catch {}
  }

  removeAudio(key) {
    this.sources.get(key)?.src.disconnect();
    this.sources.delete(key);
  }

  draw = () => {
    const { ctx } = this;
    const W = 1280, H = 720;
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, W, H);
    let tiles = [];
    try {
      tiles = this.getTiles() || [];
    } catch {}
    const share = tiles.find((t) => t.sharing && t.video);
    const n = Math.max(1, tiles.length);
    const layout = share
      ? [{ t: share, x: 12, y: 12, w: W - 24, h: H - 24, contain: true }]
      : tiles.map((t, i) => {
          const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
          const rows = Math.ceil(n / cols);
          const gap = 12, tw = (W - gap * (cols + 1)) / cols, th = (H - gap * (rows + 1)) / rows;
          return { t, x: gap + (i % cols) * (tw + gap), y: gap + Math.floor(i / cols) * (th + gap), w: tw, h: th };
        });
    for (const { t, x, y, w: tw, h: th, contain } of layout) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x, y, tw, th, 14) : ctx.rect(x, y, tw, th);
      ctx.clip();
      ctx.fillStyle = "#232326";
      ctx.fillRect(x, y, tw, th);
      const v = t.video;
      if (v && v.readyState >= 2 && v.videoWidth && !t.videoOff) {
        const s = contain ? Math.min(tw / v.videoWidth, th / v.videoHeight) : Math.max(tw / v.videoWidth, th / v.videoHeight);
        const w = v.videoWidth * s, h = v.videoHeight * s;
        try {
          ctx.drawImage(v, x + (tw - w) / 2, y + (th - h) / 2, w, h);
        } catch {}
      } else {
        ctx.fillStyle = "#7f1119";
        ctx.beginPath();
        ctx.arc(x + tw / 2, y + th / 2, Math.min(tw, th) * 0.16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `600 ${Math.round(Math.min(tw, th) * 0.12)}px Inter, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText((t.name || "?").slice(0, 2).toUpperCase(), x + tw / 2, y + th / 2);
      }
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.font = "600 18px Inter, sans-serif";
      const label = t.name || "Guest";
      const lw = ctx.measureText(label).width + 20;
      ctx.fillRect(x + 10, y + th - 38, lw, 28);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 20, y + th - 24);
      ctx.restore();
    }
    const secs = Math.floor((Date.now() - this.startedAt) / 1000);
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(14, 14, 300, 32);
    ctx.fillStyle = "#e03131";
    ctx.beginPath();
    ctx.arc(32, 30, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "700 15px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const mm = String(Math.floor(secs / 60)).padStart(2, "0"), ss = String(secs % 60).padStart(2, "0");
    ctx.fillText(`REC ${mm}:${ss} · ${(this.title || "Minutes Maker").slice(0, 26)}`, 46, 31);
  };

  async start() {
    this.startedAt = Date.now();
    await this.audio.resume().catch(() => {});
    this.draw();
    const video = this.canvas.captureStream(25);
    const stream = new MediaStream([...video.getVideoTracks(), ...this.dest.stream.getAudioTracks()]);
    const types = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    this.mimeType = mimeType || "video/webm";
    this.rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 } : undefined);
    this.rec.ondataavailable = (e) => {
      if (!e.data?.size) return;
      const seq = this.seq++;
      // chain writes so parts land in order
      this.pending = this.pending.then(() => putPart(this.id, seq, e.data)).catch(() => {});
      // heartbeat so other tabs know this recording is still live
      if (seq % 5 === 0) this.pending = this.pending.then(() => saveRecording({ ...this.meta, beat: Date.now(), duration: Date.now() - this.startedAt })).catch(() => {});
    };
    this.rec.onerror = (e) => console.warn("recorder error", e);
    this.meta = { id: this.id, meetingId: this.meetingId, title: this.title || "Meeting", createdAt: this.startedAt, duration: 0, size: 0, partial: true, mimeType: this.mimeType, userEmail: this.userEmail, userUid: this.userUid, hostEmail: this.hostEmail, hostUid: this.hostUid };
    await saveRecording({ ...this.meta, beat: Date.now() });
    markActive(this.id, true);
    this.rec.start(1000);
    // Worker-driven clock: keeps frames coming while the tab is hidden.
    const src = "let t=setInterval(()=>postMessage(0),40);onmessage=()=>{clearInterval(t);close()}";
    this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    this.worker.onmessage = () => this.draw();
  }

  get elapsed() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  /** Stops, writes the final file (with real duration) and returns it. */
  async stop() {
    if (this.stopped) return this.result;
    this.stopped = true;
    const done = new Promise((resolve) => {
      this.rec.onstop = resolve;
    });
    if (this.rec.state !== "inactive") {
      try {
        this.rec.requestData();
      } catch {}
      this.rec.stop();
      await done;
    }
    this.worker?.postMessage("stop");
    this.worker?.terminate();
    await this.pending;
    const duration = Date.now() - this.startedAt;
    this.result = await finalize(this.id, { duration, mimeType: this.mimeType });
    markActive(this.id, false);
    this.audio.close().catch(() => {});
    return this.result;
  }
}

// ---------------------------------------------------------------- IndexedDB store
const DB = "minutes-maker", STORE = "recordings", PARTS = "parts";
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PARTS)) db.createObjectStore(PARTS, { keyPath: "k" }).createIndex("recId", "recId");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}
const putPart = (recId, seq, blob) => tx(PARTS, "readwrite", (s) => s.put({ k: `${recId}:${String(seq).padStart(7, "0")}`, recId, seq, blob }));

async function getParts(recId) {
  const db = await open();
  return new Promise((res) => {
    const out = [];
    const range = IDBKeyRange.bound(`${recId}:`, `${recId}:￿`);
    const c = db.transaction(PARTS).objectStore(PARTS).openCursor(range);
    c.onsuccess = () => {
      const cur = c.result;
      if (cur) {
        out.push(cur.value);
        cur.continue();
      } else res(out.sort((a, b) => a.seq - b.seq));
    };
    c.onerror = () => res(out);
  });
}
async function deleteParts(recId) {
  const db = await open();
  return new Promise((res) => {
    const t = db.transaction(PARTS, "readwrite");
    const c = t.objectStore(PARTS).openCursor(IDBKeyRange.bound(`${recId}:`, `${recId}:￿`));
    c.onsuccess = () => {
      const cur = c.result;
      if (cur) {
        cur.delete();
        cur.continue();
      }
    };
    t.oncomplete = res;
    t.onerror = res;
  });
}

/** Joins the saved 1-second parts into one playable file with correct duration metadata. */
async function finalize(recId, { duration, mimeType, recovered } = {}) {
  const meta = (await tx(STORE, "readonly", (s) => s.get(recId))) || { id: recId, title: "Meeting", createdAt: Date.now() };
  const parts = await getParts(recId);
  if (!parts.length) {
    await tx(STORE, "readwrite", (s) => s.delete(recId));
    return null;
  }
  const type = mimeType || meta.mimeType || "video/webm";
  let blob = new Blob(parts.map((p) => p.blob), { type });
  const dur = duration || Math.max(1000, meta.duration || 0, parts.length * 1000);
  if (type.includes("webm")) {
    try {
      blob = await fixWebmDuration(blob, dur, { logger: false });
    } catch {}
  }
  const rec = { ...meta, title: recovered && !/recovered/i.test(meta.title) ? `${meta.title} (recovered)` : meta.title, duration: dur, size: blob.size, blob, partial: false };
  await tx(STORE, "readwrite", (s) => s.put(rec));
  await deleteParts(recId);
  return rec;
}

const ACTIVE = new Set();
export const markActive = (id, on) => (on ? ACTIVE.add(id) : ACTIVE.delete(id));

/** Finishes recordings that were interrupted (tab closed, crash, reload). */
export async function recoverRecordings() {
  const all = await rawList();
  let n = 0;
  for (const r of all) {
    if (r.partial && !ACTIVE.has(r.id) && Date.now() - (r.beat || r.createdAt) > 20000) {
      const done = await finalize(r.id, { recovered: true }).catch(() => null);
      if (done) n++;
    }
  }
  return n;
}

export const saveRecording = (rec) => tx(STORE, "readwrite", (s) => s.put(rec));
export async function deleteRecording(id) {
  await tx(STORE, "readwrite", (s) => s.delete(id));
  await deleteParts(id);
}
async function rawList() {
  const db = await open();
  return new Promise((res) => {
    const out = [];
    const c = db.transaction(STORE).objectStore(STORE).openCursor();
    c.onsuccess = () => {
      const cur = c.result;
      if (cur) {
        out.push(cur.value);
        cur.continue();
      } else res(out);
    };
    c.onerror = () => res(out);
  });
}
export async function listRecordings() {
  await recoverRecordings().catch(() => {});
  return (await rawList()).filter((r) => !r.partial && r.blob).sort((a, b) => b.createdAt - a.createdAt);
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
