"use client";
import { useEffect, useRef, useState } from "react";
import { Eraser, Mic, Monitor, Undo2, Volume2, X, Video, Settings as Gear, Users } from "lucide-react";
import { addStroke, clearStrokes, removeStroke, watchStrokes } from "@/lib/meetings";
import { BACKGROUNDS, testSpeaker } from "@/lib/media";
import { Switch } from "./Menus";

// ---------------------------------------------------------------- Whiteboard (shared, live)
const COLORS = ["#f2f2f3", "#ff6b6b", "#ffd43b", "#69db7c", "#4dabf7", "#da77f2"];
export function Whiteboard({ meetingId, me, canClear, onClose }) {
  const ref = useRef(null);
  const [strokes, setStrokes] = useState([]);
  const [color, setColor] = useState(COLORS[1]);
  const [width, setWidth] = useState(4);
  const cur = useRef(null);
  useEffect(() => watchStrokes(meetingId, setStrokes), [meetingId]);

  const draw = () => {
    const c = ref.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.width = r.width * devicePixelRatio;
    c.height = r.height * devicePixelRatio;
    const ctx = c.getContext("2d");
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of [...strokes, ...(cur.current ? [cur.current] : [])]) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      for (let i = 0; i < s.points.length; i += 2) {
        const x = s.points[i] * r.width, y = s.points[i + 1] * r.height;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  };
  useEffect(draw); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const mine = strokes.filter((s) => s.by === me);
  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-2xl bg-[#18181b]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="mr-2 text-sm font-semibold">Whiteboard</span>
        {COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full ${color === c ? "ring-2 ring-white ring-offset-2 ring-offset-[#18181b]" : ""}`} style={{ background: c }} />
        ))}
        <select value={width} onChange={(e) => setWidth(+e.target.value)} className="ml-2 rounded-md bg-white/10 px-2 py-1 text-xs">
          {[2, 4, 8, 14].map((w) => <option key={w} value={w}>{w}px</option>)}
        </select>
        <button title="Undo my last stroke" disabled={!mine.length} onClick={() => removeStroke(meetingId, mine[mine.length - 1].id)} className="ml-2 rounded-lg p-1.5 hover:bg-white/10 disabled:opacity-30"><Undo2 size={17} /></button>
        {canClear && <button title="Clear board" onClick={() => confirm("Clear the whiteboard for everyone?") && clearStrokes(meetingId)} className="rounded-lg p-1.5 hover:bg-white/10"><Eraser size={17} /></button>}
        <button onClick={onClose} className="ml-auto rounded-lg p-1.5 hover:bg-white/10" title="Close"><X size={18} /></button>
      </div>
      <canvas
        ref={ref}
        className="min-h-0 flex-1 cursor-crosshair touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          cur.current = { color, width, by: me, points: pos(e) };
          draw();
        }}
        onPointerMove={(e) => {
          if (!cur.current) return;
          cur.current.points.push(...pos(e));
          draw();
        }}
        onPointerUp={() => {
          const s = cur.current;
          cur.current = null;
          if (s && s.points.length > 2) addStroke(meetingId, { ...s, points: s.points.map((v) => Math.round(v * 10000) / 10000) });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- Settings (audio / video / general)
export function SettingsModal({ open, tab: initialTab = "audio", onClose, devices, micId, camId, speakerId, onMic, onCam, onSpeaker, noise, onNoise, stream, background, onBackground, mirror, onMirror, captionsOn, onCaptions }) {
  const [tab, setTab] = useState(initialTab);
  const vid = useRef(null);
  const [level, setLevel] = useState(0);
  useEffect(() => setTab(initialTab), [initialTab, open]);
  useEffect(() => {
    if (open && vid.current && stream) vid.current.srcObject = stream;
  }, [open, tab, stream]);
  useEffect(() => {
    if (!open || tab !== "audio" || !stream?.getAudioTracks().length) return;
    const ctx = new AudioContext();
    const an = ctx.createAnalyser();
    ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(an);
    const buf = new Uint8Array(256);
    let raf;
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += (v - 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(s / buf.length) / 25));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ctx.close();
    };
  }, [open, tab, stream]);
  if (!open) return null;
  const TABS = [["general", "General", Gear], ["audio", "Audio", Volume2], ["video", "Video", Video], ["backgrounds", "Backgrounds", Monitor]];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="studio-pop flex h-[560px] w-full max-w-[820px] overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="w-[200px] shrink-0 border-r border-white/10 p-3">
          <div className="px-2 pb-3 pt-1 text-lg font-bold">Settings</div>
          {TABS.map(([k, l, I]) => (
            <button key={k} onClick={() => setTab(k)} className={`mb-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${tab === k ? "bg-[#2d6cdf] text-white" : "hover:bg-white/10"}`}>
              <I size={16} /> {l}
            </button>
          ))}
        </div>
        <div className="relative flex-1 overflow-y-auto p-6">
          <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 hover:bg-white/10"><X size={18} /></button>
          {tab === "general" && (
            <div className="space-y-4">
              <h3 className="text-base font-bold">General</h3>
              <Line label="Show captions on my screen"><Switch on={captionsOn} onChange={onCaptions} /></Line>
              <Line label="Mirror my video"><Switch on={mirror} onChange={onMirror} /></Line>
            </div>
          )}
          {tab === "audio" && (
            <div className="space-y-5">
              <h3 className="text-base font-bold">Audio</h3>
              <Field label="Speaker" icon={Volume2}>
                <div className="flex gap-2">
                  <Select value={speakerId} onChange={onSpeaker} options={devices.speakers} fallback="System default" />
                  <button onClick={() => testSpeaker(speakerId)} className="shrink-0 rounded-lg bg-white/10 px-3 text-sm font-semibold hover:bg-white/15">Test Speaker</button>
                </div>
              </Field>
              <Field label="Microphone" icon={Mic}>
                <Select value={micId} onChange={onMic} options={devices.mics} fallback="Default microphone" />
                <div className="mt-3 flex items-center gap-1">
                  <span className="mr-2 text-xs text-white/50">Input level</span>
                  {Array.from({ length: 20 }).map((_, i) => (
                    <span key={i} className="h-3 flex-1 rounded-sm" style={{ background: level * 20 > i ? (i > 15 ? "#ff6b6b" : "#51cf66") : "rgba(255,255,255,.12)" }} />
                  ))}
                </div>
              </Field>
              <Line label="Background noise suppression"><Switch on={noise} onChange={onNoise} /></Line>
            </div>
          )}
          {tab === "video" && (
            <div className="space-y-5">
              <h3 className="text-base font-bold">Video</h3>
              <div className="aspect-video overflow-hidden rounded-xl bg-black">
                <video ref={vid} autoPlay playsInline muted className={`h-full w-full object-cover ${mirror ? "-scale-x-100" : ""}`} />
              </div>
              <Field label="Camera" icon={Video}><Select value={camId} onChange={onCam} options={devices.cams} fallback="Default camera" /></Field>
              <Line label="Mirror my video"><Switch on={mirror} onChange={onMirror} /></Line>
            </div>
          )}
          {tab === "backgrounds" && (
            <div className="space-y-4">
              <h3 className="text-base font-bold">Background &amp; Effects</h3>
              <div className="aspect-video overflow-hidden rounded-xl bg-black">
                <video ref={vid} autoPlay playsInline muted className={`h-full w-full object-cover ${mirror ? "-scale-x-100" : ""}`} />
              </div>
              <div className="grid grid-cols-4 gap-3">
                {BACKGROUNDS.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onBackground(b.id)}
                    className={`grid aspect-video place-items-center rounded-lg text-xs font-semibold ${background === b.id ? "ring-2 ring-[#2d6cdf]" : "ring-1 ring-white/10 hover:ring-white/30"}`}
                    style={{ background: b.css || (b.id === "blur" ? "linear-gradient(135deg,#3a3a40,#1b1b1e)" : "#111") }}
                  >
                    <span className="rounded bg-black/40 px-1.5 py-0.5">{b.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-white/50">Backgrounds run privately in your browser using on-device person segmentation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
const Line = ({ label, children }) => (
  <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3 text-sm">{label}{children}</div>
);
const Field = ({ label, icon: I, children }) => (
  <div>
    <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><I size={15} /> {label}</div>
    {children}
  </div>
);
const Select = ({ value, onChange, options, fallback }) => (
  <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm outline-none">
    {options.length ? options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>) : <option value="">{fallback}</option>}
  </select>
);

// ---------------------------------------------------------------- Breakout rooms (host)
export function BreakoutModal({ open, onClose, meeting, participants, onOpenRooms, onCloseRooms, onJoinRoom }) {
  const [count, setCount] = useState(2);
  const [assign, setAssign] = useState({});
  const others = participants.filter((p) => !p.isLocal);
  useEffect(() => {
    const a = {};
    others.forEach((p, i) => (a[p.id] = (i % count) + 1));
    setAssign(a);
  }, [count, open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;
  const openRooms = meeting.breakoutsOpen && meeting.breakouts?.length;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="studio-pop w-full max-w-[520px] p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <Users size={18} />
          <h3 className="text-lg font-bold">Breakout Rooms</h3>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 hover:bg-white/10"><X size={18} /></button>
        </div>
        {openRooms ? (
          <>
            <p className="mt-2 text-sm text-white/60">Rooms are open. Participants were moved to their rooms.</p>
            <div className="mt-4 space-y-2">
              {meeting.breakouts.map((r) => (
                <div key={r.id} className="flex items-center rounded-xl bg-white/[0.05] px-4 py-3 text-sm">
                  <span className="flex-1 font-semibold">{r.name}</span>
                  <button onClick={() => onJoinRoom(r)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15">Join</button>
                </div>
              ))}
            </div>
            <button onClick={onCloseRooms} className="mt-5 h-11 w-full rounded-xl bg-[#e03131] text-sm font-bold">Close All Rooms</button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-white/60">Split participants into smaller rooms. Each room gets its own live transcript and minutes.</p>
            <div className="mt-4 flex items-center gap-3 text-sm">
              Create
              <select value={count} onChange={(e) => setCount(+e.target.value)} className="rounded-lg bg-white/10 px-2 py-1.5">
                {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              rooms · assigned automatically
            </div>
            <div className="mt-4 max-h-[240px] space-y-1.5 overflow-y-auto">
              {others.length ? others.map((p) => (
                <div key={p.id} className="flex items-center rounded-lg bg-white/[0.04] px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{p.name}</span>
                  <select value={assign[p.id] || 1} onChange={(e) => setAssign({ ...assign, [p.id]: +e.target.value })} className="rounded-md bg-white/10 px-2 py-1 text-xs">
                    {Array.from({ length: count }).map((_, i) => <option key={i} value={i + 1}>Room {i + 1}</option>)}
                  </select>
                </div>
              )) : <p className="text-sm text-white/50">No other participants yet.</p>}
            </div>
            <button disabled={!others.length} onClick={() => onOpenRooms(count, assign)} className="mt-5 h-11 w-full rounded-xl bg-[#2d6cdf] text-sm font-bold disabled:opacity-40">Open All Rooms</button>
          </>
        )}
      </div>
    </div>
  );
}
