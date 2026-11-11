"use client";
import { useEffect, useRef } from "react";
import { Check, Captions, Grid2x2, LayoutGrid, MonitorUp, PenLine, Settings, Sparkles, VideoOff, Expand, Users } from "lucide-react";

/** Floating dark menu that closes on outside click / Escape. */
export function Pop({ open, onClose, children, className = "", style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    const key = (e) => e.key === "Escape" && onClose();
    setTimeout(() => window.addEventListener("mousedown", down), 0);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={`studio-pop animate-fade-in absolute z-40 py-2 ${className}`} style={style}>
      {children}
    </div>
  );
}

const Head = ({ children }) => <div className="px-4 pb-1 pt-2 text-[13px] font-bold">{children}</div>;
const Sep = () => <div className="mx-3 my-1.5 h-px bg-white/10" />;
const Item = ({ checked, children, onClick, right }) => (
  <button className="studio-item" onClick={onClick}>
    <span className="w-4 shrink-0">{checked ? <Check size={15} /> : null}</span>
    <span className="flex-1 truncate">{children}</span>
    {right}
  </button>
);
export function Switch({ on, onChange, disabled }) {
  return (
    <button
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${on ? "bg-[#2d6cdf]" : "bg-white/25"}`}
      role="switch"
      aria-checked={on}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function AudioMenu({ open, onClose, devices, micId, speakerId, noise, onMic, onSpeaker, onNoise, onTest, onLeaveAudio, onSettings, audioLeft }) {
  return (
    <Pop open={open} onClose={onClose} className="bottom-[72px] left-2 w-[300px]">
      <Head>Select a Microphone</Head>
      {devices.mics.length ? devices.mics.map((d) => <Item key={d.id} checked={d.id === micId} onClick={() => onMic(d.id)}>{d.label}</Item>) : <Item>Default microphone</Item>}
      <Sep />
      <Head>Select a Speaker</Head>
      {devices.speakers.length ? devices.speakers.map((d) => <Item key={d.id} checked={d.id === speakerId} onClick={() => onSpeaker(d.id)}>{d.label}</Item>) : <Item checked>System default speaker</Item>}
      <Sep />
      <Head>Microphone modes</Head>
      <Item checked={noise} onClick={() => onNoise(!noise)}>Background noise suppression</Item>
      <Sep />
      <Item onClick={onTest}>Test Speaker &amp; Microphone</Item>
      <Item onClick={onLeaveAudio}>{audioLeft ? "Join computer audio" : "Leave computer audio"}</Item>
      <Sep />
      <Item onClick={onSettings}>Audio Settings…</Item>
    </Pop>
  );
}

export function VideoMenu({ open, onClose, devices, camId, onCam, background, onBlur, onChooseBackground, onSettings }) {
  return (
    <Pop open={open} onClose={onClose} className="bottom-[72px] left-[90px] w-[290px]">
      <Head>Select a Camera</Head>
      {devices.cams.length ? devices.cams.map((d) => <Item key={d.id} checked={d.id === camId} onClick={() => onCam(d.id)}>{d.label}</Item>) : <Item checked>Default camera</Item>}
      <Sep />
      <div className="flex items-center gap-3 px-4 py-2 text-[13.5px]">
        <span className="flex-1">Blur my background</span>
        <Switch on={background === "blur"} onChange={(v) => onBlur(v)} />
      </div>
      <Item onClick={onChooseBackground}>Choose Background…</Item>
      <Sep />
      <Item onClick={onSettings}>Video Settings…</Item>
    </Pop>
  );
}

const EMOJI = ["👏", "👍", "😂", "😮", "❤️", "🎉"];
const STATUS = [
  ["yes", "✅", "Yes"],
  ["no", "❌", "No"],
  ["slower", "⏪", "Slower"],
  ["faster", "⏩", "Faster"],
  ["coffee", "☕", "Coffee break"],
];
export const STATUS_ICON = Object.fromEntries(STATUS.map(([k, i, l]) => [k, { icon: i, label: l }]));

export function ReactMenu({ open, onClose, onEmoji, status, onStatus, hand, onHand, onBrb }) {
  return (
    <Pop open={open} onClose={onClose} className="bottom-[72px] left-1/2 w-[340px] -translate-x-1/2 p-3">
      <div className="flex justify-between">
        {EMOJI.map((e) => (
          <button key={e} onClick={() => onEmoji(e)} className="grid h-11 w-11 place-items-center rounded-xl text-[26px] transition hover:scale-110 hover:bg-white/10">{e}</button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {STATUS.map(([k, icon, label]) => (
          <button key={k} title={label} onClick={() => onStatus(status === k ? null : k)} className={`grid h-10 place-items-center rounded-xl text-lg transition ${status === k ? "bg-[#2d6cdf]" : "bg-white/[0.08] hover:bg-white/15"}`}>{icon}</button>
        ))}
      </div>
      <button onClick={onHand} className={`mt-2 h-11 w-full rounded-xl text-sm font-bold transition ${hand ? "bg-[#f59f00] text-black" : "bg-white/[0.08] hover:bg-white/15"}`}>✋ {hand ? "Lower Hand" : "Raise Hand"}</button>
      <button onClick={onBrb} className={`mt-2 h-11 w-full rounded-xl text-sm font-bold transition ${status === "brb" ? "bg-[#2d6cdf]" : "bg-white/[0.08] hover:bg-white/15"}`}>⏳ {status === "brb" ? "I'm back" : "Be right back"}</button>
    </Pop>
  );
}

export function ShareMenu({ open, onClose, sharing, onShare, isHost, hostOnly, onHostOnly, canShare }) {
  return (
    <Pop open={open} onClose={onClose} className="bottom-[72px] left-1/2 w-[270px] -translate-x-1/2">
      <button className="studio-item disabled:opacity-40" disabled={!canShare && !sharing} onClick={onShare}>
        <MonitorUp size={16} /> {sharing ? "Stop sharing" : "Share screen"}
      </button>
      {!canShare && !sharing && <div className="px-4 pb-2 text-xs text-white/50">Only the host can share right now.</div>}
      {isHost && (
        <>
          <Sep />
          <Head>Who can share?</Head>
          <Item checked={hostOnly} onClick={() => onHostOnly(true)}>Only Host</Item>
          <Item checked={!hostOnly} onClick={() => onHostOnly(false)}>All Participants</Item>
        </>
      )}
    </Pop>
  );
}

export function MoreMenu({ open, onClose, items }) {
  return (
    <Pop open={open} onClose={onClose} className="bottom-[72px] right-[100px] w-[330px] p-2">
      <div className="grid grid-cols-3 gap-1">
        {items.filter(Boolean).map(({ icon: Icon, label, onClick, active, disabled }) => (
          <button
            key={label}
            disabled={disabled}
            onClick={onClick}
            className={`flex h-[78px] flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-center text-[12px] leading-tight transition disabled:opacity-35 ${active ? "ring-2 ring-[#2d6cdf]" : "hover:bg-white/10"}`}
          >
            <Icon size={19} />
            {label}
          </button>
        ))}
      </div>
    </Pop>
  );
}

export function ViewMenu({ open, onClose, view, setView, hideSelf, setHideSelf, hideNoVideo, setHideNoVideo, onFullscreen, isFullscreen }) {
  const V = [
    ["speaker", "Speaker View", LayoutGrid],
    ["gallery", "Gallery View", Grid2x2],
    ["multi", "Multi-speaker View", Users],
  ];
  return (
    <Pop open={open} onClose={onClose} className="right-2 top-[52px] w-[280px]">
      {V.map(([k, l]) => <Item key={k} checked={view === k} onClick={() => { setView(k); onClose(); }}>{l}</Item>)}
      <Sep />
      <Item checked={hideSelf} onClick={() => setHideSelf(!hideSelf)}>Hide Self View</Item>
      <Item checked={hideNoVideo} onClick={() => setHideNoVideo(!hideNoVideo)}>Hide Non-video Participants</Item>
      <Sep />
      <Item checked={isFullscreen} onClick={() => { onFullscreen(); onClose(); }} right={<Expand size={14} className="opacity-60" />}>{isFullscreen ? "Exit Fullscreen" : "Fullscreen"}</Item>
    </Pop>
  );
}

export const MoreIcons = { Captions, Grid2x2, PenLine, Settings, VideoOff, Sparkles };
