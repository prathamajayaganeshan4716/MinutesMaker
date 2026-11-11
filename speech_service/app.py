"""Minutes Maker speech service: local faster-whisper transcription for the website.
Called only by the website server route (header X-Speech-Key). Audio in, text out."""
import os, subprocess, tempfile, time
import numpy as np
from fastapi import FastAPI, Request, HTTPException
from faster_whisper import WhisperModel

def _env():
    p = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(p):
        for line in open(p):
            if "=" in line:
                k, v = line.strip().split("=", 1)
                os.environ.setdefault(k, v)
_env()
KEY = os.environ["SPEECH_KEY"]
MODEL = os.environ.get("WHISPER_MODEL", "small")
print(f"Loading faster-whisper {MODEL} ...", flush=True)
model = WhisperModel(MODEL, device="cpu", compute_type="int8", cpu_threads=12, num_workers=2)
print("Ready.", flush=True)
app = FastAPI()
BAD = ("thank you for watching", "subtitles by", "amara.org", "please subscribe")

@app.get("/health")
def health():
    return {"ok": True, "model": MODEL}

@app.post("/transcribe")
async def transcribe(request: Request):
    if request.headers.get("x-speech-key") != KEY:
        raise HTTPException(status_code=401, detail="unauthorized")
    body = await request.body()
    if not body or len(body) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="empty or too large")
    lang = request.headers.get("x-language") or None
    t0 = time.time()
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, "in")
        open(src, "wb").write(body)
        r = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", src, "-f", "f32le", "-ac", "1", "-ar", "16000", "pipe:1"], capture_output=True)
        if r.returncode != 0 or not r.stdout:
            raise HTTPException(status_code=400, detail="could not decode audio")
        audio = np.frombuffer(r.stdout, dtype=np.float32)
        segs, info = model.transcribe(audio, beam_size=1, vad_filter=True, language=lang, condition_on_previous_text=False)
        text = " ".join(s.text.strip() for s in segs).strip()
    low = text.lower()
    if any(b in low for b in BAD) or len(text) < 2:
        text = ""
    return {"text": text, "language": getattr(info, "language", None), "seconds": round(time.time() - t0, 2)}
