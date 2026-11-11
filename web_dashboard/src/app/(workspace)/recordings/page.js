"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Disc3, Download, FileText, Play, Trash2, X } from "lucide-react";
import { deleteRecording, downloadBlob, listRecordings } from "@/lib/recorder";
import { Empty } from "@/components/MeetingLists";
import { fmtDuration, Spinner } from "@/components/ui";
import { useToast } from "@/components/Providers";
import { useAuth } from "@/lib/auth";
import { watchMeetings } from "@/lib/meetings";
import { isSuperAdmin } from "@/lib/admin";

export default function Recordings() {
  const { user, loading } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [playing, setPlaying] = useState(null);

  const isSuper = isSuperAdmin(user?.email);

  const [allowed, setAllowed] = useState([]);
  const load = () => listRecordings().then(all => setItems(all.filter(r => allowed.includes(r.meetingId)))).catch(() => setItems([]));
  useEffect(() => watchMeetings(meetings => { const ids = meetings.map(m => m.id); setAllowed(ids); listRecordings().then(all => setItems(all.filter(r => ids.includes(r.meetingId)))).catch(() => setItems([])); }, { minutes: true }), []);
  useEffect(() => () => playing && URL.revokeObjectURL(playing.url), [playing]);

  if (loading) return <div className="grid h-full place-items-center"><Spinner /></div>;

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-7 md:px-8 md:py-9">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">Recordings</h1>
      <p className="mt-1 text-muted">Meeting recordings saved on this device. Download them to keep or share.</p>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items === null ? (
          <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
        ) : items.length ? (
          items.map((r) => {
            const canDelete = isSuper || !r.userEmail || (r.userEmail.toLowerCase() === user?.email?.toLowerCase()) || (r.hostEmail && r.hostEmail.toLowerCase() === user?.email?.toLowerCase());
            return (
              <div key={r.id} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
                <button className="group relative grid aspect-video w-full place-items-center bg-[#0b1020]" onClick={() => setPlaying({ ...r, url: URL.createObjectURL(r.blob) })}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(31,92,255,.45),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(107,77,255,.4),transparent_55%)]" />
                  <span className="relative grid h-14 w-14 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition group-hover:scale-110"><Play size={24} fill="#fff" /></span>
                  <span className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-0.5 font-mono text-xs text-white">{fmtDuration(r.duration)}</span>
                </button>
                <div className="p-4">
                  <div className="truncate font-semibold text-ink">{r.title}</div>
                  <div className="mt-1 text-xs text-muted">{new Date(r.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {(r.size / 1048576).toFixed(1)} MB</div>
                  <div className="mt-3 flex gap-2">
                    <button className="btn btn-ghost h-9 flex-1" onClick={() => downloadBlob(r.blob, `${r.title.replace(/[^\w-]+/g, "_")}.webm`)}><Download size={15} /> Download</button>
                    {r.meetingId && <Link className="btn btn-ghost h-9 w-9 !p-0" href={`/minutes/${r.meetingId}`} title="Minutes"><FileText size={16} /></Link>}
                    {canDelete && (
                      <button
                        className="btn btn-ghost h-9 w-9 !p-0 text-rec"
                        title="Delete"
                        onClick={async () => {
                          if (confirm("Delete this recording from this device?")) {
                            await deleteRecording(r.id);
                            toast("Recording deleted");
                            load();
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="sm:col-span-2 xl:col-span-3">
            <Empty icon={Disc3} title="No recordings yet" sub="Press Record in a meeting to capture video and audio of everyone. Recordings are stored privately in this browser." />
          </div>
        )}
      </div>
      {playing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setPlaying(null)}>
          <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center text-white">
              <span className="font-semibold">{playing.title}</span>
              <button className="ml-auto rounded-lg p-2 hover:bg-white/10" onClick={() => setPlaying(null)}><X size={20} /></button>
            </div>
            <video src={playing.url} controls autoPlay className="w-full rounded-2xl bg-black" />
          </div>
        </div>
      )}
    </div>
  );
}
