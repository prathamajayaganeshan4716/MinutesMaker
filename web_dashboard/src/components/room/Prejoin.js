"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Captions, ShieldCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Avatar, Logo, Spinner } from "../ui";
import { getSettings } from "@/lib/settings";

/** Zoom-style preview: check camera & mic, set your name, then join. */
export default function Prejoin({ meeting, defaultName, isGuest, waiting, denied, onJoin }) {
  const vid = useRef(null);
  const [stream, setStream] = useState(null);
  const [cam, setCam] = useState(true);
  const [mic, setMic] = useState(true);
  useEffect(() => {
    const st = getSettings();
    if (st.muteOnJoin) setMic(false);
    if (st.videoOffOnJoin) setCam(false);
  }, []);
  const [name, setName] = useState(defaultName || "");
  const [err, setErr] = useState("");
  const [level, setLevel] = useState(0);

  useEffect(() => {
    let s, raf, ctx;
    (async () => {
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        try {
          s = await navigator.mediaDevices.getUserMedia({ audio: true });
          setCam(false);
          setErr("Camera not available — you can still join with audio.");
        } catch {
          setErr("Allow microphone access in your browser to join with audio.");
          s = new MediaStream();
        }
      }
      setStream(s);
      if (s.getAudioTracks().length) {
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += (v - 128) ** 2;
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) / 30));
          raf = requestAnimationFrame(tick);
        };
        tick();
      }
    })();
    return () => {
      cancelAnimationFrame(raf);
      ctx?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (vid.current && stream) vid.current.srcObject = stream;
    stream?.getVideoTracks().forEach((t) => (t.enabled = cam));
    stream?.getAudioTracks().forEach((t) => (t.enabled = mic));
  }, [stream, cam, mic]);

  const hasVideo = stream?.getVideoTracks().length > 0;

  return (
    <div className="studio flex min-h-screen flex-col">
      <header className="flex h-16 items-center px-6">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm text-[var(--s-muted)] hover:text-white"><ArrowLeft size={16} /></Link>
        <div className="ml-3"><Logo onDark size={30} /></div>
      </header>
      <div className="m-auto grid w-full max-w-6xl items-center gap-10 px-6 pb-12 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="relative aspect-video overflow-hidden rounded-3xl bg-[var(--s-raised)] shadow-[0_30px_80px_rgba(0,0,0,.5)]">
            <video ref={vid} autoPlay playsInline muted className={`h-full w-full -scale-x-100 object-cover ${cam && hasVideo ? "" : "invisible"}`} />
            {!(cam && hasVideo) && (
              <div className="absolute inset-0 grid place-items-center"><Avatar name={name || "Guest"} size={110} /></div>
            )}
            {!stream && <div className="absolute inset-0 grid place-items-center text-[var(--s-muted)]"><Spinner size={28} /></div>}
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-3">
              <Round on={mic} onClick={() => setMic((v) => !v)} label={mic ? "Mute" : "Unmute"}>{mic ? <Mic size={20} /> : <MicOff size={20} />}</Round>
              <Round on={cam} onClick={() => hasVideo && setCam((v) => !v)} label={cam ? "Stop video" : "Start video"}>{cam && hasVideo ? <Video size={20} /> : <VideoOff size={20} />}</Round>
            </div>
            <div className="absolute bottom-5 right-5 flex h-8 items-end gap-[3px]">
              {[0.2, 0.4, 0.6, 0.8, 1].map((t) => (
                <span key={t} className="w-[4px] rounded-full transition-all" style={{ height: 6 + t * 22, background: mic && level > t * 0.6 ? "#12b886" : "rgba(255,255,255,.2)" }} />
              ))}
            </div>
          </div>
          {err && <p className="mt-3 text-sm text-[#ffa8a8]">{err}</p>}
        </div>

        <div>
          <div className="text-sm font-medium text-[var(--s-muted)]">You're about to join</div>
          <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white">{meeting?.title || "Meeting"}</h1>
          <div className="mt-2 font-mono text-sm text-[var(--s-muted)]">ID {meeting?.meetingCode || meeting?.id}</div>

          <div className="mt-7 space-y-3">
            <label className="text-sm font-medium text-[var(--s-muted)]">Your name</label>
            <input
              className="h-12 w-full rounded-xl border border-[var(--s-line)] bg-[var(--s-raised)] px-4 text-white outline-none focus:border-[#c2353d]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How others will see you"
              disabled={waiting}
            />
          </div>

          <div className="mt-5 space-y-2.5 rounded-2xl border border-[var(--s-line)] bg-white/[0.03] p-4 text-sm text-[var(--s-muted)]">
            <div className="flex items-center gap-2.5"><Captions size={16} className="text-[#63e6be]" /> Your speech is transcribed live while you're unmuted.</div>
            <div className="flex items-center gap-2.5"><ShieldCheck size={16} className="text-[#f1a7ab]" /> {isGuest ? "The host will admit you from the waiting room." : "You can leave any time — minutes are saved automatically."}</div>
          </div>

          {denied ? (
            <div className="mt-6 rounded-xl bg-[#f03e3e]/15 p-4 text-sm text-[#ffa8a8]">The host declined your request to join.</div>
          ) : waiting ? (
            <div className="mt-6 flex items-center gap-3 rounded-xl bg-[#c2353d]/15 p-4 text-sm text-[#f5c2c5]"><Spinner size={16} /> Waiting for the host to let you in…</div>
          ) : (
            <button
              disabled={!stream || !name.trim()}
              onClick={() => onJoin({ stream, name: name.trim(), cam: cam && hasVideo, mic })}
              className="btn btn-primary mt-6 h-12 w-full text-[15px]"
            >
              {isGuest ? "Ask to join" : "Join meeting"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Round({ on, onClick, children, label }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={`grid h-12 w-12 place-items-center rounded-full backdrop-blur transition ${on ? "bg-white/15 text-white hover:bg-white/25" : "bg-[#f03e3e] text-white"}`}
    >
      {children}
    </button>
  );
}
