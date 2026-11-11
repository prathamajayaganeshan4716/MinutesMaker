"use client";
import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { watchMeetings } from "@/lib/meetings";
import { useSearch } from "@/components/Shell";
import { Empty, MinutesCard } from "@/components/MeetingLists";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui";

export default function MinutesLibrary() {
  const { user, profile, loading } = useAuth();
  const [meetings, setMeetings] = useState(null);
  const q = useSearch();

  useEffect(() => {
    return watchMeetings(setMeetings, { minutes: true });
  }, []);

  const list = useMemo(
    () =>
      (meetings || []).filter(
        (m) =>
          (m.status === "completed" || m.status === "processing") &&
          (!q || [m.title, m.summary, m.transcript, m.hostName].some((x) => (x || "").toLowerCase().includes(q))),
      ),
    [meetings, q],
  );

  if (loading) return <div className="grid h-full place-items-center"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-7 md:px-8 md:py-9">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Minutes library</h1>
      <p className="mt-1 text-muted">Minutes available to your role — searchable from the top bar.</p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {meetings === null ? (
          <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
        ) : list.length ? (
          list.map((m) => <MinutesCard key={m.id} m={m} />)
        ) : (
          <div className="sm:col-span-2 xl:col-span-3">
            <Empty icon={FileText} title={q ? "No minutes match your search" : "Your library is empty"} sub="Minutes appear here automatically when a meeting ends." />
          </div>
        )}
      </div>
    </div>
  );
}
