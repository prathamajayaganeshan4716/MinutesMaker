"use client";

export async function listDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    const name = (d, i, kind) => d.label || `${kind} ${i + 1}`;
    const pick = (kind, label) => all.filter((d) => d.kind === kind).map((d, i) => ({ id: d.deviceId, label: name(d, i, label) }));
    return { mics: pick("audioinput", "Microphone"), cams: pick("videoinput", "Camera"), speakers: pick("audiooutput", "Speaker") };
  } catch {
    return { mics: [], cams: [], speakers: [] };
  }
}

export async function getMic(deviceId, noiseSuppression = true) {
  const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression } });
  return s.getAudioTracks()[0];
}

export async function getCam(deviceId) {
  const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } } });
  return s.getVideoTracks()[0];
}

/** Plays a short chime through the chosen speaker. */
export async function testSpeaker(sinkId) {
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(660, ctx.currentTime);
  o.frequency.setValueAtTime(880, ctx.currentTime + 0.25);
  g.gain.setValueAtTime(0.0001, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
  o.connect(g).connect(dest);
  const a = new Audio();
  a.srcObject = dest.stream;
  if (sinkId && a.setSinkId) await a.setSinkId(sinkId).catch(() => {});
  await a.play().catch(() => {});
  o.start();
  o.stop(ctx.currentTime + 1);
  setTimeout(() => ctx.close(), 1300);
}

export const BACKGROUNDS = [
  { id: "none", label: "None" },
  { id: "blur", label: "Blur" },
  { id: "maroon", label: "Maroon", css: "linear-gradient(135deg,#8e1820,#3a0609)" },
  { id: "dawn", label: "Dawn", css: "linear-gradient(135deg,#f6d5c3,#d98c8f)" },
  { id: "office", label: "Studio", css: "linear-gradient(160deg,#2b2b30,#121214)" },
  { id: "ocean", label: "Ocean", css: "linear-gradient(135deg,#0f4c75,#1b262c)" },
  { id: "forest", label: "Forest", css: "linear-gradient(135deg,#2d6a4f,#081c15)" },
  { id: "paper", label: "Paper", css: "linear-gradient(135deg,#f8f5f0,#e7ded3)" },
];

function paintBackground(ctx, bg, w, h) {
  const c = BACKGROUNDS.find((b) => b.id === bg);
  const stops = (c?.css || "").match(/#[0-9a-f]{6}/gi) || ["#222", "#111"];
  const g = ctx.createLinearGradient(0, 0, w, h);
  stops.forEach((s, i) => g.addColorStop(i / Math.max(1, stops.length - 1), s));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Replaces the camera background (blur or a colour backdrop) using MediaPipe's selfie segmenter,
 * producing a new video track that is sent to everyone.
 */
export class BackgroundProcessor {
  constructor() {
    this.mode = "none";
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.small = document.createElement("canvas");
    this.sctx = this.small.getContext("2d", { willReadFrequently: true });
    this.maskC = document.createElement("canvas");
    this.mctx = this.maskC.getContext("2d");
    this.person = document.createElement("canvas");
    this.pctx = this.person.getContext("2d");
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
  }

  async init() {
    if (this.seg) return;
    const vision = await import("@mediapipe/tasks-vision");
    const fileset = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
    this.seg = await vision.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });
  }

  /** Starts processing a camera track and returns the processed output track. */
  async start(cameraTrack, mode) {
    await this.init();
    this.mode = mode;
    this.video.srcObject = new MediaStream([cameraTrack]);
    await this.video.play().catch(() => {});
    const s = cameraTrack.getSettings();
    const W = s.width || 1280, H = s.height || 720;
    this.canvas.width = W;
    this.canvas.height = H;
    this.person.width = W;
    this.person.height = H;
    this.small.width = 256;
    this.small.height = Math.round((256 * H) / W);
    this.maskC.width = this.small.width;
    this.maskC.height = this.small.height;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
    this.track = this.canvas.captureStream(25).getVideoTracks()[0];
    return this.track;
  }

  setMode(mode) {
    this.mode = mode;
  }

  frame() {
    const v = this.video;
    if (v.readyState < 2) return;
    const { ctx, canvas } = this;
    const W = canvas.width, H = canvas.height;
    this.sctx.drawImage(v, 0, 0, this.small.width, this.small.height);
    let mask = null;
    try {
      const res = this.seg.segmentForVideo(this.small, performance.now());
      mask = res.confidenceMasks?.[0]?.getAsFloat32Array();
      res.close?.();
    } catch {}
    // background
    if (this.mode === "blur") {
      ctx.filter = "blur(14px)";
      ctx.drawImage(v, 0, 0, W, H);
      ctx.filter = "none";
    } else paintBackground(ctx, this.mode, W, H);
    if (!mask) {
      ctx.drawImage(v, 0, 0, W, H);
      return;
    }
    // person cut-out
    const img = this.mctx.createImageData(this.maskC.width, this.maskC.height);
    for (let i = 0; i < mask.length; i++) img.data[i * 4 + 3] = Math.min(255, Math.max(0, (mask[i] - 0.25) * 400));
    this.mctx.putImageData(img, 0, 0);
    const p = this.pctx;
    p.globalCompositeOperation = "source-over";
    p.clearRect(0, 0, W, H);
    p.drawImage(v, 0, 0, W, H);
    p.globalCompositeOperation = "destination-in";
    p.filter = "blur(2px)";
    p.drawImage(this.maskC, 0, 0, W, H);
    p.filter = "none";
    ctx.drawImage(this.person, 0, 0);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.track?.stop();
    this.track = null;
  }
}
