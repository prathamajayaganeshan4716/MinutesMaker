"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Copy, FileText, MoreHorizontal, Pencil, Printer, Trash2, Users, Video } from "lucide-react";
import { useState } from "react";
import { AvatarStack, StatusPill } from "./ui";
import { useToast } from "./Providers";
import { canDeleteMeeting, canEditMeeting, deleteMeeting, inviteLink, toDate } from "@/lib/meetings";
import { isAdmin, useAuth } from "@/lib/auth";
import { EditMeetingDialog } from "./MeetingDialogs";

export const people = (m) => (m.participants || "").split(",").map((s) => s.trim()).filter(Boolean);

const fmtTime = (d) => d?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) || "";
const fmtDay = (d) => {
  if (!d) return "";
  const t = new Date();
  const tm = new Date(t);
  tm.setDate(t.getDate() + 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === tm.toDateString()) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
};

export function MeetingRow({ m, canDelete: propCanDelete, canEdit: propCanEdit }) {
  const router = useRouter();
  const toast = useToast();
  const { user, profile } = useAuth();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const when = toDate(m.scheduledAt) || toDate(m.createdAt);
  const live = m.status === "recording" || m.status === "waiting";
  const admin = isAdmin(user, profile);
  const canEdit = propCanEdit !== undefined ? propCanEdit : canEditMeeting(m, user);
  const canDelete = propCanDelete !== undefined ? propCanDelete : canDeleteMeeting(m, user);
  const canStart = admin || canEdit;

  const copy = async () => {
    await navigator.clipboard.writeText(inviteLink(m));
    toast("Invite link copied", "success");
  };

  return (
    <div className="group flex items-center gap-5 rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-brand/40 sm:p-5">
      <div className="w-[86px] shrink-0">
        <div className="font-display text-[22px] font-bold leading-none text-ink">{fmtTime(when).replace(/\s?(AM|PM)/i, "")}<span className="ml-1 text-xs font-semibold text-muted">{fmtTime(when).match(/AM|PM/i)?.[0]}</span></div>
        <div className="mt-1.5 text-xs font-medium text-muted">{fmtDay(when)}</div>
      </div>
      <div className={`h-12 w-[3px] shrink-0 rounded-full ${live ? "bg-live" : "bg-brand"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="truncate font-semibold text-ink">{m.title || "Untitled meeting"}</span>
          <StatusPill status={m.status} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span className="flex items-center gap-1.5"><Video size={13} /> ID <span className="font-mono">{m.meetingCode || m.id.slice(0, 10)}</span></span>
          {m.hostName && <span>Host · {m.hostName}</span>}
        </div>
        {people(m).length > 0 && <div className="mt-2.5"><AvatarStack names={people(m)} size={24} /></div>}
      </div>
      <div className="flex items-center gap-1.5">
        <button className="btn btn-primary h-9 px-4" onClick={() => router.push(`/room/${m.id}`)}>
          {canStart && m.status === "scheduled" ? "Start" : "Join"}
        </button>
        {user && (
          <div className="relative">
            <button className="btn h-9 w-9 !p-0 text-muted hover:bg-surface-2 hover:text-ink" onClick={() => setMenu((v) => !v)} aria-label="More">
              <MoreHorizontal size={18} />
            </button>
            {menu && (
              <div className="card absolute right-0 top-10 z-20 w-52 p-1.5 shadow-pop" onMouseLeave={() => setMenu(false)}>
                <Item icon={Copy} onClick={() => { setMenu(false); copy(); }}>Copy invite link</Item>
                {canEdit && (
                  <Item icon={Pencil} onClick={() => { setMenu(false); setEditing(true); }}>Edit meeting</Item>
                )}
                {canDelete && (
                  <Item icon={Trash2} danger onClick={async () => {
                    setMenu(false);
                    if (confirm("Delete this meeting?")) {
                      try {
                        await deleteMeeting(m.id, user);
                        toast("Meeting deleted");
                      } catch (e) {
                        toast(e.message, "error");
                      }
                    }
                  }}>
                    Delete
                  </Item>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {editing && <EditMeetingDialog open={editing} onClose={() => setEditing(false)} meeting={m} />}
    </div>
  );
}

export function MinutesCard({ m }) {
  const when = toDate(m.endedAt) || toDate(m.createdAt);
  return (
    <Link href={`/minutes/${m.id}`} className="group flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-pop">
      <div className="flex items-center justify-between gap-2">
        <StatusPill status={m.status} />
        <span className="text-xs text-muted">{when?.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}</span>
      </div>
      <h3 className="mt-3.5 line-clamp-1 font-display text-[16.5px] font-bold text-ink">{m.title || "Untitled meeting"}</h3>
      <p className="mt-1.5 line-clamp-3 min-h-[60px] text-[13.5px] leading-relaxed text-ink-2">
        {m.summary || (m.status === "completed" ? "Transcript available — open to read the full conversation." : "Minutes will appear here when the meeting ends.")}
      </p>
      <div className="mt-4 flex items-center justify-between">
        {people(m).length ? <AvatarStack names={people(m)} size={24} /> : <span className="flex items-center gap-1.5 text-xs text-muted"><Users size={13} /> {m.hostName || "Host"}</span>}
        <span className="flex items-center gap-1 text-xs font-semibold text-brand opacity-0 transition group-hover:opacity-100">
          <FileText size={14} /> Open minutes
        </span>
      </div>
    </Link>
  );
}

export function Empty({ icon: Icon = CalendarClock, title, sub, action }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand"><Icon size={26} /></div>
      <div className="mt-4 font-semibold text-ink">{title}</div>
      <div className="mt-1 max-w-sm text-sm text-muted">{sub}</div>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function Item({ icon: Icon, children, onClick, danger }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium hover:bg-surface-2 ${danger ? "text-rec" : "text-ink"}`}>
      <Icon size={16} /> {children}
    </button>
  );
}

export { Printer };
