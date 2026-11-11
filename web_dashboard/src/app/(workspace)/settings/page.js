"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, Trash2 } from "lucide-react";
import { useAuth, displayName, isAdmin, signOut } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/admin";
import { getSettings, saveSettings } from "@/lib/settings";
import { listRecordings, deleteRecording } from "@/lib/recorder";
import { Avatar, ThemeSwitch } from "@/components/ui";
import { useToast } from "@/components/Providers";

const LANGS = [["", "Auto-detect"], ["en", "English"], ["ta", "Tamil"], ["hi", "Hindi"], ["te", "Telugu"], ["ml", "Malayalam"], ["kn", "Kannada"]];
const TABS = [
  ["ai", "Minutes AI"],
  ["general", "General"],
  ["meeting", "Meeting"],
  ["recording", "Recording"],
  ["transcript", "Transcript"],
  ["av", "Audio & Video"],
  ["whiteboard", "Whiteboard"],
  ["notes", "My Notes"],
  ["profile", "Profile"],
];

export default function Settings() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const [s, setS] = useState(null);
  const [tab, setTab] = useState("ai");
  const [q, setQ] = useState("");
  const bar = useRef(null);
  const [edge, setEdge] = useState({ l: false, r: true });

  const admin = isAdmin(user, profile);
  const isSuper = isSuperAdmin(user?.email);
  const effectiveTabs = TABS;
  const activeTab = tab;

  useEffect(() => {
    setS(getSettings());
    const pick = () => {
      const h = window.location.hash.slice(1);
      if (TABS.some(([k]) => k === h)) setTab(h);
    };
    pick();
    window.addEventListener("hashchange", pick);
    return () => window.removeEventListener("hashchange", pick);
  }, []);
  const set = (patch) => {
    setS(saveSettings(patch));
    toast("Setting saved", "success");
  };
  const onScroll = () => {
    const el = bar.current;
    if (el) setEdge({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(onScroll, []);
  const scrollBy = (d) => bar.current?.scrollBy({ left: d, behavior: "smooth" });

  const ROWS = useMemo(() => s && buildRows(s, set), [s]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s) return null;
  const query = q.trim().toLowerCase();
  const visible = query ? ROWS.filter((r) => (r.title + " " + (r.sub || "")).toLowerCase().includes(query)) : ROWS.filter((r) => r.tab === tab);

  return (
    <div className="mx-auto max-w-[980px] px-4 py-7 md:px-8 md:py-9">
      <h1 className="font-display text-[28px] font-extrabold tracking-tight text-ink">Settings</h1>
      {admin && (
        <div className="relative mt-5 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings" className="input h-9 pl-9" />
        </div>
      )}

      {/* Zoom-style horizontal tab menu */}
      <div className="relative mt-5 border-b border-line">
        {edge.l && (
          <button onClick={() => scrollBy(-220)} className="absolute left-0 top-0 z-10 grid h-10 w-8 place-items-center bg-gradient-to-r from-bg via-bg to-transparent text-muted hover:text-ink"><ChevronLeft size={18} /></button>
        )}
        <div ref={bar} onScroll={onScroll} className="no-scrollbar flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {effectiveTabs.map(([k, l]) => (
            <button
              key={k}
              onClick={() => {
                setTab(k);
                setQ("");
                history.replaceState(null, "", `#${k}`);
              }}
              className={`relative shrink-0 rounded-t-lg px-3.5 pb-2.5 pt-2 text-[14px] font-medium transition ${!query && activeTab === k ? "text-ink" : "text-muted hover:bg-surface-2 hover:text-ink"}`}
            >
              {l}
              {!query && activeTab === k && <span className="absolute inset-x-2 bottom-0 h-[2.5px] rounded-full bg-brand" />}
            </button>
          ))}
        </div>
        {edge.r && (
          <button onClick={() => scrollBy(220)} className="absolute right-0 top-0 z-10 grid h-10 w-8 place-items-center bg-gradient-to-l from-bg via-bg to-transparent text-muted hover:text-ink"><ChevronRight size={18} /></button>
        )}
      </div>

      <div className="mt-6">
        {!query && activeTab === "profile" ? (
          <ProfileTab user={user} profile={profile} />
        ) : !query && activeTab === "notes" ? (
          <NotesTab toast={toast} me={user} />
        ) : (
          <div className="card divide-y divide-line p-0">
            {visible.map((r) => (
              <div key={r.title} className="flex items-center gap-6 px-6 py-5">
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-semibold text-ink">{r.title}</div>
                  {r.sub && <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{r.sub}</div>}
                </div>
                <div className="shrink-0">{r.control}</div>
              </div>
            ))}
            {!visible.length && <div className="px-6 py-10 text-center text-sm text-muted">No settings match.</div>}
          </div>
        )}
        {admin && !query && activeTab === "recording" && <RecordingStorage toast={toast} me={user} />}
      </div>
    </div>
  );
}

function buildRows(s, set) {
  const T = (k) => <Toggle on={!!s[k]} onChange={(v) => set({ [k]: v })} />;
  return [
    { tab: "ai", title: "Write minutes automatically when I end a meeting", sub: "Summary, decisions, action items and conclusion are generated from the transcript.", control: T("autoMinutes") },
    { tab: "ai", title: "Allow AI summary for participants in my meetings", sub: "Default for new meetings. You can change it any time in Host tools › Advanced › AI.", control: T("defaultAiSummary") },
    { tab: "general", title: "Theme", sub: "Light, dark, or follow your system.", control: <ThemeSwitch /> },
    {
      tab: "general",
      title: "Time format",
      sub: "How times are shown in meetings and minutes.",
      control: (
        <select className="input h-9 w-36" value={s.timeFormat} onChange={(e) => set({ timeFormat: e.target.value })}>
          <option value="12h">12-hour</option>
          <option value="24h">24-hour</option>
        </select>
      ),
    },
    { tab: "general", title: "Ask me to confirm when I leave a meeting", control: T("confirmLeave") },
    { tab: "meeting", title: "Mute my microphone when joining", control: T("muteOnJoin") },
    { tab: "meeting", title: "Turn off my video when joining", control: T("videoOffOnJoin") },
    { tab: "meeting", title: "Show meeting timer", sub: "Elapsed time in the meeting top bar.", control: T("showTimer") },
    { tab: "meeting", title: "Enable waiting room for new meetings", sub: "Everyone except the host waits until admitted.", control: T("defaultWaitingRoom") },
    { tab: "recording", title: "Download recordings automatically", sub: "Save a .webm file to your computer as soon as recording stops.", control: T("autoDownloadRecording") },
    { tab: "recording", title: "Recording notice for participants", sub: "Everyone always sees a REC indicator while a meeting is being recorded.", control: <Toggle on disabled onChange={() => {}} /> },
    {
      tab: "transcript",
      title: "Transcription language",
      sub: "Helps Whisper transcribe accurately. Auto-detect works for most meetings.",
      control: (
        <select className="input h-9 w-44" value={s.language} onChange={(e) => set({ language: e.target.value })}>
          {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ),
    },
    { tab: "transcript", title: "Show live captions", sub: "The latest spoken line appears over the video.", control: T("captions") },
    { tab: "av", title: "Mirror my video", control: T("mirrorVideo") },
    { tab: "av", title: "Background noise suppression", control: T("noiseSuppression") },
    { tab: "whiteboard", title: "Only the host can start whiteboards", sub: "Default for new meetings.", control: T("whiteboardHostOnly") },
  ];
}

function Toggle({ on, onChange, disabled }) {
  return (
    <button disabled={disabled} onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition disabled:opacity-50 ${on ? "bg-brand" : "bg-surface-3"}`} role="switch" aria-checked={on}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function RecordingStorage({ toast, me }) {
  const [recs, setRecs] = useState(null);
  const isSuper = isSuperAdmin(me?.email);
  const load = () => listRecordings().then(setRecs).catch(() => setRecs([]));
  useEffect(() => {
    load();
  }, []);
  const size = (recs || []).reduce((a, r) => a + (r.size || 0), 0);
  return (
    <div className="card mt-5 flex flex-wrap items-center gap-4 p-6">
      <div className="flex-1">
        <div className="text-[14.5px] font-semibold text-ink">Recordings on this device</div>
        <div className="text-[13px] text-muted">{recs ? `${recs.length} recording${recs.length === 1 ? "" : "s"} · ${(size / 1048576).toFixed(1)} MB` : "…"}</div>
      </div>
      <Link href="/recordings" className="btn btn-ghost h-9">Manage</Link>
      {isSuper && (
        <button
          className="btn btn-danger h-9"
          disabled={!recs?.length}
          onClick={async () => {
            if (!confirm("Delete ALL recordings stored on this device?")) return;
            for (const r of recs) await deleteRecording(r.id);
            toast("All recordings deleted");
            load();
          }}
        >
          <Trash2 size={15} /> Delete all
        </button>
      )}
    </div>
  );
}

function NotesTab({ toast, me }) {
  const [notes, setNotes] = useState([]);
  const isSuper = isSuperAdmin(me?.email);

  const load = () => {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("mm-notes-") && localStorage.getItem(k)) {
          const raw = localStorage.getItem(k);
          let noteObj = { k, id: k.slice(9), text: raw, userEmail: "" };
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && parsed.text !== undefined) {
              noteObj.text = parsed.text;
              noteObj.userEmail = parsed.userEmail || "";
            }
          } catch {}
          out.push(noteObj);
        }
      }
    } catch {}
    setNotes(out);
  };
  useEffect(load, []);
  if (!notes.length) return <div className="card p-10 text-center text-sm text-muted">Notes you write in Host tools › Advanced › My Notes during meetings appear here.</div>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {notes.map((n) => {
        const canDelete = isSuper || !n.userEmail || n.userEmail.toLowerCase() === me?.email?.toLowerCase();
        return (
          <div key={n.k} className="card p-5">
            <p className="line-clamp-6 whitespace-pre-line text-sm leading-relaxed text-ink-2">{n.text}</p>
            <div className="mt-4 flex items-center gap-2">
              <Link href={`/minutes/${n.id}`} className="text-sm font-semibold text-brand hover:underline">Open meeting</Link>
              {canDelete && (
                <button
                  className="ml-auto rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-rec"
                  title="Delete note"
                  onClick={() => {
                    if (!confirm("Delete this note?")) return;
                    localStorage.removeItem(n.k);
                    toast("Note deleted");
                    load();
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProfileTab({ user, profile }) {
  const name = displayName(user, profile);
  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar name={name} size={64} />
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl font-bold text-ink">{name}</div>
          <div className="text-sm text-muted">{user?.email}</div>
          <div className="mt-1.5 text-xs font-semibold text-brand">{isAdmin(user, profile) ? "Administrator" : "Member"}{profile?.department ? ` · ${profile.department}` : ""}</div>
        </div>
        <button className="btn btn-ghost" onClick={() => signOut()}>Sign out</button>
      </div>
    </div>
  );
}
