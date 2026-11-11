"use client";
import { auth } from "./firebase";

/**
 * Live transcription of the local microphone.
 * - Whisper (Hugging Face, or the Minutes Maker speech server as fallback) produces the saved transcript
 *   from short self-contained audio chunks.
 * - The browser's speech recogniser (Chrome / Edge) shows instant interim captions while Whisper works,
 *   and is used as the saved transcript only if the Whisper route is unavailable.
 */
export class LiveTranscriber {
  constructor({ chunkMs = 12000, onFinal, onInterim, onStatus, language }) {
    Object.assign(this, { chunkMs, onFinal, onInterim, onStatus, language });
    this.running = false;
    this.rec = null;
    this.speech = null;
    this.serverOk = true;
    this.pending = 0;
    this.generation = 0;
  }

  start(stream) {
    if (this.running) return;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;
    this.running = true;
    const generation = ++this.generation;
    this.stream = new MediaStream(audioTracks);
    this.cycle(generation);
    this.startSpeech();
    this.onStatus?.("listening");
  }

  stop() {
    this.running = false;
    this.generation++;
    clearTimeout(this.timer);
    try {
      if (this.rec && this.rec.state !== "inactive") this.rec.stop();
    } catch {}
    try {
      this.speech?.stop();
    } catch {}
    this.speech = null;
    this.onInterim?.("");
    this.onStatus?.(this.pending ? "transcribing" : "idle");
  }

  mime() {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
    return types.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) || "";
  }

  // Each chunk is its own recorder so every upload is a complete, decodable file.
  cycle(generation = this.generation) {
    if (!this.running || generation !== this.generation) return;
    const chunks = [];
    const startedAt = Date.now();
    let rec;
    try {
      rec = new MediaRecorder(this.stream, this.mime() ? { mimeType: this.mime() } : undefined);
    } catch (e) {
      console.warn("MediaRecorder unavailable", e);
      this.serverOk = false;
      return;
    }
    this.rec = rec;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size > 4000) this.upload(blob, startedAt);
      if (this.running && generation === this.generation) this.cycle(generation);
    };
    rec.start();
    this.timer = setTimeout(() => rec.state !== "inactive" && rec.stop(), this.chunkMs);
  }

  async upload(blob, startedAt) {
    this.pending++;
    this.onStatus?.("transcribing");
    try {
      const r = await fetch("/api/transcribe", { method: "POST", headers: { Authorization: `Bearer ${await auth.currentUser?.getIdToken()}`, "Content-Type": blob.type, ...(this.language ? { "x-language": this.language } : {}) }, body: blob });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { text, engine } = await r.json();
      this.serverOk = true;
      if (text && text.trim()) this.onFinal?.(text.trim(), { startedAt, engine });
    } catch (e) {
      console.warn("transcribe chunk failed", e);
      this.serverOk = false;
    } finally {
      this.pending--;
      this.onStatus?.(this.running ? "listening" : this.pending ? "transcribing" : "idle");
    }
  }

  startSpeech() {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) return;
    const s = new SR();
    s.continuous = true;
    s.interimResults = true;
    if (this.language) s.lang = this.language;
    s.onresult = (ev) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) {
          // Only save browser text when the Whisper route is down; otherwise Whisper's version is saved.
          if (!this.serverOk && res[0].transcript.trim()) this.onFinal?.(res[0].transcript.trim(), { startedAt: Date.now(), engine: "browser" });
        } else interim += res[0].transcript;
      }
      this.onInterim?.(interim.trim());
    };
    s.onend = () => {
      if (this.running && this.speech === s) {
        try {
          s.start();
        } catch {}
      }
    };
    s.onerror = () => {};
    try {
      s.start();
      this.speech = s;
    } catch {}
  }
}
