"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun, X } from "lucide-react";
import { useTheme } from "./Providers";

export function Logo({ size = 32, withName = true, onDark = false, sub = false }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div
        className="grid shrink-0 place-items-center rounded-[28%] text-white shadow-[0_6px_16px_rgba(127,17,25,.35)]"
        style={{ width: size, height: size, background: "linear-gradient(145deg,#a3222b,#6d0c13 60%,#4a070c)" }}
      >
        <span className="brand-mark block" style={{ width: size * 0.74, height: size * 0.74 }} />
      </div>
      {withName && (
        <div className="leading-none">
          <div className={`font-display text-[15px] font-extrabold tracking-[0.08em] ${onDark ? "text-white" : "text-ink"}`}>
            MINUTES <span className={onDark ? "text-[#f1a7ab]" : "text-brand"}>MAKER</span>
          </div>
          {sub && <div className={`mt-1 text-[10.5px] font-medium tracking-wide ${onDark ? "text-white/60" : "text-muted"}`}>Smart Meeting Collaboration & Minutes</div>}
        </div>
      )}
    </div>
  );
}

const PALETTE = ["#6c8cff", "#22c3a0", "#f472b6", "#f5a524", "#38bdf8", "#a78bfa", "#fb7185", "#2dd4bf", "#f97316", "#84cc16"];
export function colorFor(name = "") {
  let h = 0;
  for (const c of name.trim().toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
export function initials(name = "") {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2)).toUpperCase();
}

export function Avatar({ name = "", size = 36, ring = false, className = "" }) {
  const c = colorFor(name);
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full font-semibold text-white ${ring ? "ring-2 ring-surface" : ""} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, ${c}, color-mix(in oklab, ${c} 70%, #000))` }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}

export function AvatarStack({ names = [], max = 4, size = 28 }) {
  const shown = names.slice(0, max);
  return (
    <div className="flex items-center">
      {shown.map((n, i) => (
        <div key={n + i} style={{ marginLeft: i ? -size * 0.32 : 0 }}>
          <Avatar name={n} size={size} ring />
        </div>
      ))}
      {names.length > max && <span className="ml-2 text-xs text-muted">+{names.length - max}</span>}
    </div>
  );
}

const STATUS = {
  recording: ["Live", "var(--rec)", true],
  waiting: ["Open", "var(--brand)", false],
  processing: ["Writing minutes", "var(--warn)", true],
  completed: ["Minutes ready", "var(--live)", false],
  scheduled: ["Scheduled", "var(--brand-2)", false],
};
export function StatusPill({ status = "" }) {
  const [label, color, pulse] = STATUS[status] || [status ? status[0].toUpperCase() + status.slice(1) : "Draft", "var(--muted)", false];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
      style={{ color, background: `color-mix(in oklab, ${color} 13%, transparent)` }}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${pulse ? "live-dot" : ""}`} style={{ background: color, color }} />
      {label}
    </span>
  );
}

export function Equalizer({ active = true, color = "var(--live)", height = 14 }) {
  return (
    <span className="eq inline-flex items-end gap-[2px]" style={{ color, height }}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ height, animationDelay: `${i * 0.15}s`, animationPlayState: active ? "running" : "paused", transform: active ? undefined : "scaleY(.3)" }} />
      ))}
    </span>
  );
}

export function ThemeSwitch({ compact = false }) {
  const { theme, setTheme } = useTheme();
  const opts = [
    ["light", Sun, "Light"],
    ["dark", Moon, "Dark"],
    ["system", Monitor, "System"],
  ];
  return (
    <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1" role="radiogroup" aria-label="Theme">
      {opts.map(([v, Icon, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={theme === v}
          title={label}
          onClick={() => setTheme(v)}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            theme === v ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
          }`}
        >
          <Icon size={15} />
          {!compact && label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, icon, children, footer, width = 460 }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="card animate-fade-in w-full p-0 shadow-pop" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 pt-6">
          {icon && <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">{icon}</div>}
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function useNow(ms = 1000) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function fmtDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? `${h}:` : "") + `${String(m).padStart(h ? 2 : 1, "0")}:${String(x).padStart(2, "0")}`;
}

export function Spinner({ size = 18 }) {
  return <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent" style={{ width: size, height: size }} />;
}
