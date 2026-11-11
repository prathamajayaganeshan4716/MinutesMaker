"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Video } from "lucide-react";
import { watchMeetings, toDate } from "@/lib/meetings";
import { openDialog, useSearch } from "@/components/Shell";
import { Empty, MeetingRow, MinutesCard } from "@/components/MeetingLists";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui";

const TABS = [
  ["upcoming", "Upcoming"],
  ["live", "Live now"],
  ["past", "Past"],
];

export default function MeetingsPage() {
  const { user, profile, loading } = useAuth();
  const [meetings, setMeetings] = useState(null);
  const [tab, setTab] = useState("upcoming");
  const q = useSearch();

  useEffect(() => {
    return watchMeetings(setMeetings);
  }, []);

  const at = (m) => (toDate(m.scheduledAt) || toDate(m.createdAt) || new Date(0)).getTime();
  const list = useMemo(() => {
    const all = (meetings || []).filter((m) => !q || (m.title || "").toLowerCase().includes(q) || (m.meetingCode || "").includes(q));
    if (tab === "upcoming") return all.filter((m) => m.status === "scheduled").sort((a, b) => at(a) - at(b));
    if (tab === "live") return all.filter((m) => m.status === "recording" || m.status === "waiting");
    return all.filter((m) => m.status === "completed" || m.status === "processing");
  }, [meetings, tab, q]);

  if (loading) return <div className="grid h-full place-items-center"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Meetings</h1>
          <p className="mt-1 text-muted">Everything scheduled, happening now and already captured.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="btn btn-ghost" onClick={() => openDialog("schedule")}><CalendarPlus size={17} /> Schedule</button>
          <button className="btn btn-primary" onClick={() => openDialog("new")}><Video size={17} /> New meeting</button>
        </div>
      </div>
      <div className="mt-7 inline-flex rounded-xl border border-line bg-surface p-1">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === k ? "bg-brand text-white shadow-card" : "text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className={tab === "past" ? "mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "mt-5 grid gap-3"}>
        {meetings === null ? (
          <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
        ) : list.length ? (
          list.map((m) => (tab === "past" ? <MinutesCard key={m.id} m={m} /> : <MeetingRow key={m.id} m={m} />))
        ) : (
          <div className="sm:col-span-2 xl:col-span-3">
            <Empty title={tab === "upcoming" ? "Nothing scheduled" : tab === "live" ? "No meetings in progress" : "No past meetings"} sub="Start a meeting and the transcript will be captured automatically." />
          </div>
        )}
      </div>
    </div>
  );
}
