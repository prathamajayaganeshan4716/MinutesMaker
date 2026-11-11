"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Copy, Disc3, Download, Flag, ListChecks, Pencil, Play, Printer, RefreshCw, Search, Sparkles, Target, Trash2, Video, X } from "lucide-react";
import { watchAttendance, canDeleteMeeting, canEditMeeting, deleteMeeting, deleteSegment, deleteTranscript } from "@/lib/meetings";
import { deleteRecording, downloadBlob, listRecordings } from "@/lib/recorder";
import { useAuth } from "@/lib/auth";
import { access } from "@/lib/access-client";
import { canEditMinutes, isSuper } from "@/lib/permissions";
import { completeMeeting, summarize, toDate, transcriptText, watchMeeting, watchTranscript } from "@/lib/meetings";
import { Avatar, AvatarStack, colorFor, Spinner, StatusPill, fmtDuration } from "@/components/ui";
import { people } from "@/components/MeetingLists";
import { useToast } from "@/components/Providers";
import { EditMeetingDialog } from "@/components/MeetingDialogs";
import { printBoardMinutes } from "@/lib/board-minutes";

function bullets(text) {
  return (text || "")
    .split(/\n|•/)
    .map((s) => s.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((s) => s && !/^(none|no explicit|no action)/i.test(s));
}

function Highlight({ text, q }) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((p, i) => (p.toLowerCase() === q.toLowerCase() ? <mark key={i} className="rounded bg-warn/30 px-0.5 text-ink">{p}</mark> : p));
}

export default function MinutesDetail() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const { user, profile, loading } = useAuth();
  const [attendance, setAttendance] = useState(null);
  const [m, setM] = useState(undefined);
  const [segs, setSegs] = useState(null);
  const [q, setQ] = useState("");
  const [who, setWho] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState({});
  const [recs, setRecs] = useState([]);
  const [playing, setPlaying] = useState(null);
  const [editingMeeting, setEditingMeeting] = useState(false);
  const [minutesDraft, setMinutesDraft] = useState(null);
  const [savingMinutes, setSavingMinutes] = useState(false);
  const [privateTranscript, setPrivateTranscript] = useState({ text: '', canEdit: false });
  const [transcriptDraft, setTranscriptDraft] = useState(null);
  const [savingTranscript, setSavingTranscript] = useState(false);

  const loadRecs = () => listRecordings().then((all) => setRecs(all.filter((r) => r.meetingId === id))).catch(() => {});
  useEffect(() => {
    loadRecs();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => watchMeeting(id, setM, { minutes: true }), [id]);
  useEffect(() => watchAttendance(id, (records) => setAttendance({ id, records })), [id]);
  useEffect(() => watchTranscript(id, setSegs), [id]);
  useEffect(() => { let alive = true; access(`transcripts/${id}`).then(result => { if (alive) setPrivateTranscript({ text: result.transcript || '', canEdit: result.canEdit === true }); }).catch(() => { if (alive) setPrivateTranscript({ text: '', canEdit: false }); }); return () => { alive = false; }; }, [id]);
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(`mm-actions-${id}`) || "{}"));
    } catch {}
  }, [id]);

  // Fall back to the stored transcript text for meetings recorded before segments existed.
  const lines = useMemo(() => {
    if (segs?.length) return segs;
    return (m?.transcript || "")
      .split("\n")
      .map((l, i) => {
        const x = l.match(/^([^:]{1,40}):\s*(.*)$/);
        return x ? { id: i, speakerName: x[1], text: x[2] } : { id: i, speakerName: "", text: l };
      })
      .filter((l) => l.text);
  }, [segs, m]);

  const speakers = useMemo(() => [...new Set(lines.map((l) => l.speakerName).filter(Boolean))], [lines]);
  const t0 = lines[0]?.sequenceNumber;
  const filtered = lines.filter((l) => (!who || l.speakerName === who) && (!q || (l.text || "").toLowerCase().includes(q.toLowerCase())));
  const groups = useMemo(() => {
    const g = [];
    for (const l of filtered) {
      const last = g[g.length - 1];
      if (last && last.speaker === l.speakerName && (!l.sequenceNumber || !last.end || l.sequenceNumber - last.end < 90000)) {
        last.items.push(l);
        last.end = l.sequenceNumber;
      } else g.push({ speaker: l.speakerName, start: l.sequenceNumber, end: l.sequenceNumber, items: [l] });
    }
    return g;
  }, [filtered]);

  if (loading || m === undefined) return <div className="grid h-full place-items-center"><Spinner /></div>;

  if (m === null)
    return (
      <div className="grid h-full place-items-center text-center p-6">
        <div>
          <div className="font-semibold text-ink text-lg">Minutes unavailable</div>
          <p className="mt-1 text-sm text-muted">You may not have permission to view this team’s minutes.</p>
          <Link href="/meetings" className="btn btn-primary mt-4">Back to meetings</Link>
        </div>
      </div>
    );

  const attendanceRecords = attendance?.id === id ? attendance.records : null;
  const created = toDate(m.createdAt), ended = toDate(m.endedAt);
  const fullText = privateTranscript.text || transcriptText(lines);
  const canEdit = canEditMeeting(m, user);
  const canDelete = canDeleteMeeting(m, user);
  const canEditDocument = canEditMinutes(profile, m);
  const editDraft = minutesDraft?.id === id ? minutesDraft : null;
  const actions = bullets(m.actionItems), decisions = bullets(m.decisions);

  const beginMinutesEdit = () => setMinutesDraft({ id, summary: m.summary || "", decisions: m.decisions || "", actionItems: m.actionItems || "", conclusion: m.conclusion || "" });
  const updateMinutesDraft = (field, value) => setMinutesDraft(current => current?.id === id ? { ...current, [field]: value } : current);
  const saveMinutesDraft = async () => {
    if (!editDraft || !canEditDocument) return;
    setSavingMinutes(true);
    try {
      await access(`minutes/${id}`, { method: "PUT", body: { summary: editDraft.summary, decisions: editDraft.decisions, actionItems: editDraft.actionItems, conclusion: editDraft.conclusion, summarySource: "edited" } });
      setMinutesDraft(null);
      toast("Document saved", "success");
    } catch (error) { toast(error.message || "Could not save the document", "error"); }
    finally { setSavingMinutes(false); }
  };
  const saveTranscript = async () => {
    if (transcriptDraft === null || !privateTranscript.canEdit) return;
    setSavingTranscript(true);
    try { await access(`transcripts/${id}`, { method: 'PUT', body: { transcript: transcriptDraft } }); setPrivateTranscript(value => ({ ...value, text: transcriptDraft })); setTranscriptDraft(null); toast('Transcript corrections saved', 'success'); }
    catch (error) { toast(error.message || 'Could not save transcript', 'error'); }
    finally { setSavingTranscript(false); }
  };
  const publishTranscript = async () => {
    if (!isSuper(profile) || !confirm('Publish this reviewed transcript to Admins and Board Members?')) return;
    try { await access(`transcripts/${id}`, { method: 'POST', body: {} }); setM(value => ({ ...value, transcriptPublished: true, transcriptStatus: 'published' })); toast('Transcript published', 'success'); }
    catch (error) { toast(error.message || 'Could not publish transcript', 'error'); }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(fullText);
    toast("Transcript copied", "success");
  };
  const download = () => {
    const header = `${m.title}\n${created?.toLocaleString() || ""}\n\nSUMMARY\n${m.summary || "-"}\n\nDECISIONS\n${m.decisions || "-"}\n\nACTION ITEMS\n${m.actionItems || "-"}\n\nCONCLUSION\n${m.conclusion || "-"}\n\nTRANSCRIPT\n`;
    const url = URL.createObjectURL(new Blob([header + fullText], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${(m.title || "minutes").replace(/[^\w-]+/g, "_")}.txt` });
    a.click();
    URL.revokeObjectURL(url);
  };
  const regenerate = async () => {
    setBusy(true);
    try {
      const report = await summarize(fullText);
      await completeMeeting(id, report, fullText);
      toast("Minutes updated", "success");
    } catch { toast("Could not generate minutes", "error"); }
    finally { setBusy(false); }
  };
  const toggle = (i) => {
    const n = { ...done, [i]: !done[i] };
    setDone(n);
    try {
      localStorage.setItem(`mm-actions-${id}`, JSON.stringify(n));
    } catch {}
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-8 md:py-8">
      <button onClick={() => router.back()} className="no-print mb-5 flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <StatusPill status={m.status} />
            {m.summarySource && <span className="text-xs text-muted">{m.summarySource === "huggingface" ? "AI summary · Hugging Face" : "Auto summary"}</span>}
          </div>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink md:text-[34px]">{m.title || "Untitled meeting"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
            {created && <span>{created.toLocaleString([], { dateStyle: "full", timeStyle: "short" })}</span>}
            {created && ended && <span>Duration {fmtDuration(ended - created)}</span>}
            {m.hostName && <span>Host · {m.hostName}</span>}
            <span>{lines.length} transcript lines</span>
          </div>
          {people(m).length > 0 && <div className="mt-3"><AvatarStack names={people(m)} max={8} /></div>}
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {(m.status === "recording" || m.status === "waiting") && <Link href={`/room/${id}`} className="btn btn-primary"><Video size={16} /> Rejoin</Link>}
          {canEdit && (
            <button className="btn btn-ghost" onClick={() => setEditingMeeting(true)}>
              <Pencil size={16} /> Edit meeting
            </button>
          )}
          {canEditDocument && (editDraft ? <>
            <button className="btn btn-ghost" onClick={() => setMinutesDraft(null)} disabled={savingMinutes}>Cancel document edit</button>
            <button className="btn btn-primary" onClick={saveMinutesDraft} disabled={savingMinutes}>{savingMinutes ? <Spinner size={15} /> : null} Save document</button>
          </> : <button className="btn btn-ghost" onClick={beginMinutesEdit}><Pencil size={16} /> Edit document</button>)}
          {privateTranscript.canEdit && transcriptDraft === null && <button className="btn btn-ghost" onClick={() => setTranscriptDraft(fullText)}><Pencil size={16} /> Edit transcript</button>}
          {transcriptDraft !== null && <button className="btn btn-primary" onClick={saveTranscript} disabled={savingTranscript}>{savingTranscript ? 'Saving…' : 'Save transcript'}</button>}
          {isSuper(profile) && !m.transcriptPublished && (privateTranscript.text || lines.length > 0) && <button className="btn btn-primary" onClick={publishTranscript}>Publish transcript</button>}
          <button className="btn btn-ghost" onClick={copy}><Copy size={16} /> Copy</button>
          <button className="btn btn-ghost" onClick={download}><Download size={16} /> .txt</button>
          <button className="btn btn-ghost" onClick={() => {
            try { printBoardMinutes(m, m.attendanceTracked === true ? attendanceRecords : null, fullText); }
            catch (error) { toast(error.message, "error"); }
          }}><Printer size={16} /> PDF</button>
          {canEditDocument && <button className="btn btn-ghost" onClick={regenerate} disabled={busy || !lines.length}>{busy ? <Spinner size={15} /> : <RefreshCw size={16} />} Regenerate</button>}
          {canDelete && (
            <button
              className="btn btn-ghost text-rec"
              disabled={!lines.length}
              onClick={async () => {
                if (!confirm("Delete the entire transcript of this meeting? This can't be undone.")) return;
                await deleteTranscript(id);
                toast("Transcript deleted");
              }}
            >
              <Trash2 size={16} /> Transcript
            </button>
          )}
          {canDelete && (
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!confirm("Delete this meeting, its transcript and minutes permanently?")) return;
                try {
                  await deleteMeeting(id, user);
                  toast("Meeting deleted");
                  router.push("/meetings");
                } catch (e) {
                  toast(e.message, "error");
                }
              }}
            >
              <Trash2 size={16} /> Delete meeting
            </button>
          )}
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Transcript (main) */}
        <section className="card min-w-0 p-0">
          <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-t-[20px] border-b border-line bg-surface/95 px-5 py-4 backdrop-blur">
            <h2 className="font-display text-lg font-bold text-ink">Transcript</h2>
            <div className="relative ml-auto w-full sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input h-9 pl-9" placeholder="Search transcript" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {speakers.length > 1 && (
              <div className="flex w-full flex-wrap gap-1.5">
                <Chip on={!who} onClick={() => setWho("")}>Everyone</Chip>
                {speakers.map((s) => <Chip key={s} on={who === s} onClick={() => setWho(who === s ? "" : s)} color={colorFor(s)}>{s}</Chip>)}
              </div>
            )}
          </div>
          <div className="px-5 py-5">
            {transcriptDraft !== null && <textarea aria-label="Edit meeting transcript" className="input min-h-[360px] w-full resize-y font-mono text-sm leading-relaxed" value={transcriptDraft} onChange={e => setTranscriptDraft(e.target.value)} />}
            {transcriptDraft === null && (segs === null && !m.transcript ? (
              <Spinner />
            ) : groups.length ? (
              <div className="space-y-6">
                {groups.map((g, i) => (
                  <div key={i} className="flex gap-3.5">
                    <Avatar name={g.speaker || "?"} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold" style={{ color: colorFor(g.speaker || "") }}>{g.speaker || "Speaker"}</span>
                        {t0 && g.start && <span className="font-mono text-[11px] text-muted">{fmtDuration(g.start - t0)}</span>}
                      </div>
                      <div className="mt-1 space-y-1.5 text-[15px] leading-relaxed text-ink">
                        {g.items.map((l) => (
                          <p key={l.id} className="group/line relative -mx-2 rounded-lg px-2 hover:bg-surface-2">
                            <Highlight text={l.text || ""} q={q} />
                            {canDelete && segs?.length > 0 && (
                              <button
                                title="Delete this line"
                                onClick={() => confirm("Delete this line from the transcript?") && deleteSegment(id, l.id)}
                                className="no-print absolute right-1 top-1 hidden rounded-md p-1 text-muted hover:bg-surface-3 hover:text-rec group-hover/line:block"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-16 text-center text-sm text-muted">{q || who ? "No lines match your filter." : "No transcript was captured for this meeting."}</div>
            ))}
          </div>
        </section>

        {/* AI minutes */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {m.status === "processing" && (
            <div className="card flex items-center gap-3 p-5 text-sm"><Spinner /> Writing minutes from the transcript…</div>
          )}
          <MinCard icon={Sparkles} title="Summary" tone="var(--brand)">
            {editDraft ? <textarea aria-label="Meeting summary" className="input min-h-32 resize-y text-sm leading-relaxed" value={editDraft.summary} onChange={e => updateMinutesDraft("summary", e.target.value)} /> : <p className="text-[14px] leading-relaxed text-ink-2">{m.summary || "The summary will appear when the meeting ends."}</p>}
          </MinCard>
          {m.agenda && (
            <MinCard icon={Target} title="Agenda" tone="var(--brand-2)">
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink-2">{m.agenda}</p>
            </MinCard>
          )}
          <MinCard icon={CheckCircle2} title="Decisions" tone="var(--live)">
            {editDraft ? <textarea aria-label="Meeting decisions" className="input min-h-28 resize-y text-sm leading-relaxed" placeholder="One decision per line" value={editDraft.decisions} onChange={e => updateMinutesDraft("decisions", e.target.value)} /> : decisions.length ? (
              <ul className="space-y-2">{decisions.map((d, i) => <li key={i} className="flex gap-2 text-[14px] leading-relaxed text-ink-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-live" />{d}</li>)}</ul>
            ) : <p className="text-sm text-muted">No explicit decisions recorded.</p>}
          </MinCard>
          <MinCard icon={ListChecks} title="Action items" tone="var(--warn)">
            {editDraft ? <textarea aria-label="Meeting action items" className="input min-h-28 resize-y text-sm leading-relaxed" placeholder="One action item per line" value={editDraft.actionItems} onChange={e => updateMinutesDraft("actionItems", e.target.value)} /> : actions.length ? (
              <ul className="space-y-1">
                {actions.map((a, i) => (
                  <li key={i}>
                    <label className="flex cursor-pointer gap-2.5 rounded-lg p-1.5 text-[14px] leading-relaxed hover:bg-surface-2">
                      <input type="checkbox" checked={!!done[i]} onChange={() => toggle(i)} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
                      <span className={done[i] ? "text-muted line-through" : "text-ink-2"}>{a}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No action items assigned.</p>}
          </MinCard>
          {recs.length > 0 && (
            <MinCard icon={Disc3} title="Recordings on this device" tone="var(--brand)">
              <div className="space-y-2">
                {recs.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-xl bg-surface-2 p-2.5 text-sm">
                    <button onClick={() => setPlaying({ ...r, url: URL.createObjectURL(r.blob) })} className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white"><Play size={14} fill="#fff" /></button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-ink">{new Date(r.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {fmtDuration(r.duration)}</div>
                      <div className="text-xs text-muted">{(r.size / 1048576).toFixed(1)} MB</div>
                    </div>
                    <button title="Download" onClick={() => downloadBlob(r.blob, `${(m.title || "recording").replace(/[^\w-]+/g, "_")}.webm`)} className="rounded-lg p-1.5 text-muted hover:bg-surface-3 hover:text-ink"><Download size={15} /></button>
                    <button title="Delete recording" onClick={async () => { if (confirm("Delete this recording?")) { await deleteRecording(r.id); loadRecs(); toast("Recording deleted"); } }} className="rounded-lg p-1.5 text-muted hover:bg-surface-3 hover:text-rec"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </MinCard>
          )}
          <MinCard icon={Flag} title="Conclusion" tone="var(--rec)">
            {editDraft ? <textarea aria-label="Meeting conclusion" className="input min-h-24 resize-y text-sm leading-relaxed" value={editDraft.conclusion} onChange={e => updateMinutesDraft("conclusion", e.target.value)} /> : <p className="text-[14px] leading-relaxed text-ink-2">{m.conclusion || "—"}</p>}
          </MinCard>
        </aside>
      </div>

      {editingMeeting && (
        <EditMeetingDialog
          open={editingMeeting}
          onClose={() => setEditingMeeting(false)}
          meeting={m}
          onSaved={() => toast("Meeting updated", "success")}
        />
      )}

      {playing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => { URL.revokeObjectURL(playing.url); setPlaying(null); }}>
          <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center text-white"><span className="font-semibold">{m.title}</span><button className="ml-auto rounded-lg p-2 hover:bg-white/10" onClick={() => setPlaying(null)}><X size={20} /></button></div>
            <video src={playing.url} controls autoPlay className="w-full rounded-2xl bg-black" />
          </div>
        </div>
      )}
    </div>
  );
}

function MinCard({ icon: Icon, title, tone, children }) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ color: tone, background: `color-mix(in oklab, ${tone} 13%, transparent)` }}><Icon size={17} /></span>
        <h3 className="font-semibold text-ink">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children, color }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? "border-brand bg-brand-soft text-brand" : "border-line text-muted hover:text-ink"}`}>
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}
