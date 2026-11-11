"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  CalendarPlus,
  Clock3,
  FileText,
  LogIn,
  MonitorUp,
  Sparkles,
  Video,
} from "lucide-react";
import { canCreate, canReadMinutes } from "@/lib/permissions";
import { useAuth, displayName, isAdmin } from "@/lib/auth";
import { watchMeetings, toDate } from "@/lib/meetings";
import { openDialog, useSearch } from "@/components/Shell";
import { MeetingRow, MinutesCard, Empty } from "@/components/MeetingLists";
import { useNow } from "@/components/ui";

export default function Home() {
  const { user, profile } = useAuth();
  const now = useNow(1000);
  const q = useSearch();
  const [meetings, setMeetings] = useState(null);
  useEffect(() => watchMeetings(setMeetings), []);

  const admin = isAdmin(user, profile);

  const match = (m) =>
    !q ||
    (m.title || "").toLowerCase().includes(q) ||
    (m.meetingCode || "").includes(q);
  const at = (m) => (toDate(m.scheduledAt) || toDate(m.createdAt) || new Date(0)).getTime();
  const upcoming = useMemo(() => {
    const list = (meetings || []).filter(
      (m) => ["scheduled", "recording", "waiting"].includes(m.status) && match(m)
    );
    const live = list.filter((m) => m.status !== "scheduled" && Date.now() - at(m) < 6 * 3600e3);
    const sched = list.filter((m) => m.status === "scheduled").sort((a, b) => at(a) - at(b));
    return [...live, ...sched].slice(0, 5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, q]);

  const recent = useMemo(
    () =>
      (meetings || [])
        .filter((m) => ["completed", "processing"].includes(m.status) && match(m))
        .slice(0, 6),
    [meetings, q]
  );

  const stats = useMemo(() => {
    const all = meetings || [];
    const done = all.filter((m) => m.status === "completed" && canReadMinutes(profile, m));
    const mins = done.reduce((a, m) => {
      const s = toDate(m.startedAt) || toDate(m.createdAt),
        e = toDate(m.endedAt);
      return a + (s && e ? Math.max(0, (e - s) / 60000) : 0);
    }, 0);
    return {
      total: all.filter((m) => m.status !== "scheduled").length,
      done: done.length,
      hours: mins / 60,
      upcoming: all.filter((m) => m.status === "scheduled").length,
    };
  }, [meetings, profile]);

  const first = displayName(user, profile).split(" ")[0];
  const hour = now?.getHours() ?? 12;
  const next = upcoming.find((m) => m.status === "scheduled");

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-7 md:px-8 md:py-9">
      {/* Header */}
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="text-sm font-medium text-muted" suppressHydrationWarning>
            {now?.toLocaleDateString([], {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            }) || "\u00a0"}
          </div>
          <h1 className="mt-1 font-display text-[30px] font-extrabold tracking-tight text-ink md:text-[34px]">
            {hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, {first}
          </h1>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => openDialog("join")}>
            <LogIn size={16} /> Join
          </button>
          {canCreate(profile) && <button className="btn btn-ghost" onClick={() => openDialog("schedule")}>
            <CalendarPlus size={16} /> Schedule
          </button>}
          {canCreate(profile) && <button className="btn btn-primary" onClick={() => openDialog("new")}>
            <Video size={16} /> New meeting
          </button>}
        </div>
      </div>

      {/* Hero */}
      <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="relative overflow-hidden rounded-[24px] bg-[radial-gradient(120%_120%_at_0%_0%,#9b1c25_0%,#6a0c13_50%,#3a0609_100%)] p-7 text-white shadow-pop md:p-9">
          <span className="brand-mark pointer-events-none absolute -right-10 -top-6 block h-[320px] w-[320px] text-white opacity-[0.07]" />
          <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-semibold backdrop-blur">
            <Sparkles size={14} /> Transcript-first meetings
          </span>
          <h2 className="mt-4 max-w-xl font-display text-[26px] font-extrabold leading-tight tracking-tight md:text-[32px]">
            Meet, speak naturally — Minutes Maker writes it all down.
          </h2>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/75">
            Live transcript for every speaker, recording on demand, and minutes with decisions and action items the moment you end.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {canCreate(profile) && <button
              onClick={() => openDialog("new")}
              className="btn h-11 bg-white px-5 text-[#6a0c13] hover:bg-white/90"
            >
              <Video size={17} /> Start instant meeting
            </button>}
            <button
              onClick={() => openDialog("join")}
              className="btn h-11 border border-white/25 bg-white/10 text-white hover:bg-white/15 px-5"
            >
              <LogIn size={17} /> Join with a code
            </button>
          </div>
        </div>
        <div className="card relative flex min-h-[260px] flex-col overflow-hidden p-0 text-white">
          <img
            src={`/img/nature-${hour < 10 ? "morning" : hour < 14 ? "day" : hour < 17 ? "afternoon" : "evening"}.jpg`}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-black/70" />
          <div className="relative p-6">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/80">
              <Clock3 size={14} /> Local time
            </div>
            <div
              className="mt-2 font-display text-[48px] font-extrabold leading-none tracking-tight drop-shadow"
              suppressHydrationWarning
            >
              {now ? now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "\u00a0"}
            </div>
            <div className="mt-1.5 text-sm text-white/85" suppressHydrationWarning>
              {now?.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
            </div>
            <div className="mt-0.5 text-xs text-white/70">
              {typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : ""}
            </div>
          </div>
          <div className="relative mt-auto p-4">
            <div className="rounded-xl bg-black/35 p-3 backdrop-blur-md">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Up next</div>
              {next ? (
                <Link href={`/room/${next.id}`} className="mt-1 block">
                  <div className="truncate text-sm font-semibold">{next.title}</div>
                  <div className="text-xs text-white/75">
                    {toDate(next.scheduledAt)?.toLocaleString([], {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </Link>
              ) : (
                <p className="mt-1 text-sm text-white/85">Nothing scheduled. Enjoy the focus time.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Action
          icon={Video}
          title="New meeting"
          sub="Start now with live transcript"
          onClick={() => openDialog("new")}
        />
        <Action
          icon={LogIn}
          title="Join a meeting"
          sub="Use a code or invite link"
          onClick={() => openDialog("join")}
        />
        <Action
          icon={CalendarPlus}
          title="Schedule"
          sub="Plan and share an invite"
          onClick={() => openDialog("schedule")}
        />
        <Action
          icon={MonitorUp}
          title="Present"
          sub="Start and share your screen"
          onClick={() => openDialog("new")}
        />
      </div>

      {/* KPIs */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={AudioLines} value={stats.total} label="Meetings captured" />
        <Kpi icon={FileText} value={stats.done} label="Minutes ready" tone="var(--live)" />
        <Kpi icon={Clock3} value={stats.hours.toFixed(1)} label="Hours transcribed" />
        <Kpi icon={CalendarPlus} value={stats.upcoming} label="Scheduled" />
      </div>

      {/* Upcoming & live */}
      <section className="mt-11">
        <Header title="Upcoming & live" count={upcoming.length} href="/meetings" />
        <div className="mt-4 grid gap-3">
          {meetings === null ? (
            <Skeleton />
          ) : upcoming.length ? (
            upcoming.map((m) => <MeetingRow key={m.id} m={m} />)
          ) : (
            <Empty
              title="No upcoming meetings"
              sub="Schedule a meeting or start one right now."
              action={canCreate(profile) && <button className="btn btn-primary" onClick={() => openDialog("schedule")}>
                  Schedule a meeting
                </button>}
            />
          )}
        </div>
      </section>

      {/* Recent minutes */}
      <section className="mt-11">
        <Header title="Recent minutes" count={recent.length} href="/minutes" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {meetings === null ? (
            <Skeleton />
          ) : recent.length ? (
            recent.map((m) => <MinutesCard key={m.id} m={m} />)
          ) : (
            <div className="sm:col-span-2 xl:col-span-3">
              <Empty
                icon={Sparkles}
                title="No minutes yet"
                sub="When a meeting ends, its transcript becomes clear minutes with decisions and action items."
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Action({ icon: Icon, title, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand/40"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-white">
        <Icon size={20} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14.5px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      <ArrowRight
        size={16}
        className="ml-auto shrink-0 text-muted opacity-0 transition group-hover:opacity-100"
      />
    </button>
  );
}

function Kpi({ icon: Icon, value, label, tone }) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-muted">
        <Icon size={19} />
      </span>
      <div>
        <div className="font-display text-2xl font-extrabold" style={{ color: tone || "var(--ink)" }}>
          {value}
        </div>
        <div className="text-xs text-muted">{label}</div>
      </div>
    </div>
  );
}

function Header({ title, count, href }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      <span className="rounded-lg bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">
        {count}
      </span>
      <Link href={href} className="ml-auto flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
        View all <ArrowRight size={15} />
      </Link>
    </div>
  );
}

function Skeleton() {
  return <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />;
}
