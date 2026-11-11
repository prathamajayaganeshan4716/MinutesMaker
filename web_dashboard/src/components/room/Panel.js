"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, AudioLines, Check, CheckCircle2, Copy, Flag, Hand, ListChecks, MessageSquare, Mic, MicOff, MonitorUp, Send, Sparkles, StickyNote, Users, Video, VideoOff, X } from "lucide-react";
import { Avatar, colorFor, Equalizer, Spinner, fmtDuration } from "../ui";
import { addSegment, sendChat, summarize, transcriptText } from "@/lib/meetings";

const TABS = [
  ["transcript", "Transcript", AudioLines],
  ["summary", "Summary", Sparkles],
  ["chat", "Chat", MessageSquare],
  ["people", "People", Users],
];

export default function Panel({ tab, setTab, onClose, meetingId, myName, segments, interim, captions, chat, unread, participants, absent, status, isHost, canChat = true, canRename = true, aiAllowed = true, onRename, onPeerAction, onMuteAll, hidePictures }) {
  const tabs = TABS.filter(([k]) => k !== "summary" || aiAllowed || isHost);
  return (
    <aside className="flex h-full w-full flex-col border-l border-[var(--s-line)] bg-[var(--s-panel)] md:w-[392px]">
      <div className="flex items-center gap-1 border-b border-[var(--s-line)] px-2 pt-2">
        {tabs.map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`relative flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-t-lg px-1 py-2.5 text-[12px] font-semibold transition ${
              tab === k ? "text-white" : "text-[var(--s-muted)] hover:text-white"
            }`}
          >
            <Icon size={15} />
            <span className="hidden min-[420px]:inline">{label}</span>
            {k === "chat" && unread > 0 && <span className="rounded-full bg-[#f03e3e] px-1.5 text-[10px] text-white">{unread}</span>}
            
            {tab === k && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[#c2353d]" />}
          </button>
        ))}
        <button onClick={onClose} className="mb-1 ml-1 rounded-lg p-2 text-[var(--s-muted)] hover:bg-white/5 hover:text-white" title="Close panel"><X size={17} /></button>
      </div>
      <div className="min-h-0 flex-1">
        {tab === "transcript" && <TranscriptTab meetingId={meetingId} myName={myName} segments={segments} interim={interim} captions={captions} status={status} />}
        {tab === "summary" && <SummaryTab segments={segments} />}
        {tab === "chat" && <ChatTab meetingId={meetingId} myName={myName} chat={chat} canChat={canChat || isHost} />}
        {tab === "people" && <PeopleTab participants={participants} absent={absent} isHost={isHost} canRename={canRename || isHost} onRename={onRename} onPeerAction={onPeerAction} onMuteAll={onMuteAll} myName={myName} hidePictures={hidePictures} />}
      </div>
    </aside>
  );
}

function TranscriptTab({ meetingId, myName, segments, interim, captions, status }) {
  const box = useRef(null);
  const [stick, setStick] = useState(true);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const t0 = segments[0]?.sequenceNumber;
  const groups = useMemo(() => {
    const g = [];
    for (const s of segments) {
      const last = g[g.length - 1];
      if (last && last.speaker === s.speakerName && s.sequenceNumber - last.end < 60000) {
        last.items.push(s);
        last.end = s.sequenceNumber;
      } else g.push({ speaker: s.speakerName, start: s.sequenceNumber, end: s.sequenceNumber, items: [s] });
    }
    return g;
  }, [segments]);
  const live = [...(interim ? [[myName, interim]] : []), ...Object.entries(captions).filter(([n, t]) => t && n !== myName)];

  useEffect(() => {
    if (stick && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [segments, interim, captions, stick]);

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    await addSegment(meetingId, { speakerName: myName, text: `📝 ${note.trim()}`, sequenceNumber: Date.now(), source: "note" });
    setNote("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-[var(--s-muted)]">
        {status === "listening" ? (
          <span className="flex items-center gap-2 text-[#63e6be]"><Equalizer color="#63e6be" height={12} /> Listening — transcribing live</span>
        ) : status === "transcribing" ? (
          <span className="flex items-center gap-2 text-[#f1a7ab]"><Spinner size={12} /> Transcribing…</span>
        ) : (
          <span className="flex items-center gap-2"><MicOff size={13} /> Unmute to add your words to the transcript</span>
        )}
        <button
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 hover:bg-white/5 hover:text-white"
          onClick={async () => {
            await navigator.clipboard.writeText(transcriptText(segments));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
        }}
        className="relative min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4"
      >
        {!groups.length && !live.length && (
          <div className="mt-16 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/5 text-[#f1a7ab]"><AudioLines size={26} /></div>
            <div className="mt-4 font-semibold">The transcript starts when someone speaks</div>
            <p className="mx-auto mt-1 max-w-[260px] text-sm text-[var(--s-muted)]">Each person's words appear here with their name, a few seconds after they're spoken.</p>
          </div>
        )}
        {groups.map((g, i) => (
          <div key={i} className="flex gap-3 animate-fade-in">
            <Avatar name={g.speaker || "?"} size={30} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-bold" style={{ color: colorFor(g.speaker || "") }}>{g.speaker}{g.speaker === myName ? " (You)" : ""}</span>
                {t0 && <span className="font-mono text-[10.5px] text-[var(--s-muted)]">{fmtDuration(g.start - t0)}</span>}
              </div>
              <div className="mt-0.5 space-y-1 text-[14px] leading-relaxed text-[#dfe4ee]">
                {g.items.map((s) => <p key={s.id} className={s.source === "note" ? "rounded-lg bg-[#f59f00]/10 px-2 py-1 text-[#ffd8a8]" : ""}>{s.text}</p>)}
              </div>
            </div>
          </div>
        ))}
        {live.map(([n, t]) => (
          <div key={`live-${n}`} className="flex gap-3 opacity-80">
            <Avatar name={n} size={30} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] font-bold" style={{ color: colorFor(n) }}>{n} <Equalizer color={colorFor(n)} height={10} /></div>
              <p className="mt-0.5 text-[14px] italic leading-relaxed text-[var(--s-muted)]">{t}…</p>
            </div>
          </div>
        ))}
        {!stick && (
          <button onClick={() => setStick(true)} className="sticky bottom-2 left-1/2 mx-auto flex -translate-x-0 items-center gap-1.5 rounded-full bg-[#c2353d] px-3 py-1.5 text-xs font-semibold text-white shadow-lg">
            <ArrowDown size={13} /> Jump to live
          </button>
        )}
      </div>
      <form onSubmit={addNote} className="flex gap-2 border-t border-[var(--s-line)] p-3">
        <div className="relative flex-1">
          <StickyNote size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--s-muted)]" />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note to the transcript" className="h-10 w-full rounded-xl border border-[var(--s-line)] bg-[var(--s-raised)] pl-9 pr-3 text-sm text-white outline-none focus:border-[#c2353d]" />
        </div>
        <button className="grid h-10 w-10 place-items-center rounded-xl bg-[#c2353d] text-white disabled:opacity-40" disabled={!note.trim()}><Send size={16} /></button>
      </form>
    </div>
  );
}

function SummaryTab({ segments }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async () => {
    setBusy(true);
    setErr("");
    try {
      setRes(await summarize(transcriptText(segments)));
    } catch {
      setErr("Could not summarise right now.");
    }
    setBusy(false);
  };
  const list = (t) => (t || "").split("\n").map((s) => s.replace(/^•\s*/, "").trim()).filter(Boolean);
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="rounded-2xl bg-[linear-gradient(135deg,rgba(77,125,255,.18),rgba(138,109,255,.14))] p-5">
        <div className="flex items-center gap-2 font-semibold"><Sparkles size={17} className="text-[#b197fc]" /> Catch up instantly</div>
        <p className="mt-1.5 text-sm text-[var(--s-muted)]">Summarise everything said so far — decisions and action items included. Full minutes are written automatically when the meeting ends.</p>
        <button onClick={run} disabled={busy || segments.length < 2} className="btn btn-primary mt-4 h-10 w-full">
          {busy ? <Spinner size={15} /> : <Sparkles size={16} />} {res ? "Refresh summary" : "Summarise so far"}
        </button>
        {segments.length < 2 && <p className="mt-2 text-xs text-[var(--s-muted)]">Needs a little more conversation first.</p>}
      </div>
      {err && <p className="mt-4 text-sm text-[#ffa8a8]">{err}</p>}
      {res && (
        <div className="mt-5 space-y-4 animate-fade-in">
          <Block icon={Sparkles} title="Summary" tone="#f1a7ab"><p className="text-sm leading-relaxed text-[#dfe4ee]">{res.summary}</p></Block>
          <Block icon={CheckCircle2} title="Decisions" tone="#63e6be"><Ul items={list(res.decisions)} /></Block>
          <Block icon={ListChecks} title="Action items" tone="#ffc078"><Ul items={list(res.actionItems)} /></Block>
          <Block icon={Flag} title="Where things landed" tone="#ff8787"><p className="text-sm leading-relaxed text-[#dfe4ee]">{res.conclusion}</p></Block>
        </div>
      )}
    </div>
  );
}

function Block({ icon: Icon, title, tone, children }) {
  return (
    <div className="rounded-2xl border border-[var(--s-line)] bg-[var(--s-raised)] p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: tone }}><Icon size={15} /> {title}</div>
      {children}
    </div>
  );
}
const Ul = ({ items }) => (
  <ul className="space-y-1.5">{items.map((t, i) => <li key={i} className="flex gap-2 text-sm leading-relaxed text-[#dfe4ee]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />{t}</li>)}</ul>
);

function ChatTab({ meetingId, myName, chat, canChat }) {
  const [text, setText] = useState("");
  const box = useRef(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [chat]);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    await sendChat(meetingId, myName, text.trim());
    setText("");
  };
  return (
    <div className="flex h-full flex-col">
      <div ref={box} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {!chat.length && <p className="mt-16 text-center text-sm text-[var(--s-muted)]">Messages are visible to everyone in the meeting.</p>}
        {chat.map((c) => {
          const me = c.sender === myName;
          return (
            <div key={c.id} className={`flex gap-2.5 ${me ? "flex-row-reverse" : ""}`}>
              {!me && <Avatar name={c.sender || "?"} size={28} />}
              <div className={`max-w-[80%] ${me ? "items-end" : ""} flex flex-col`}>
                {!me && <span className="mb-0.5 text-[11px] font-semibold" style={{ color: colorFor(c.sender || "") }}>{c.sender}</span>}
                <div className={`rounded-2xl px-3.5 py-2 text-sm ${me ? "rounded-br-md bg-[#c2353d] text-white" : "rounded-bl-md bg-[var(--s-raised)] text-[#dfe4ee]"}`}>{c.text}</div>
              </div>
            </div>
          );
        })}
      </div>
      {!canChat ? <div className="border-t border-[var(--s-line)] p-4 text-center text-sm text-[var(--s-muted)]">The host has turned off chat for participants.</div> : <form onSubmit={send} className="flex gap-2 border-t border-[var(--s-line)] p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message everyone" className="h-10 flex-1 rounded-xl border border-[var(--s-line)] bg-[var(--s-raised)] px-3.5 text-sm text-white outline-none focus:border-[#c2353d]" />
        <button className="grid h-10 w-10 place-items-center rounded-xl bg-[#c2353d] text-white disabled:opacity-40" disabled={!text.trim()}><Send size={16} /></button>
      </form>}
    </div>
  );
}

function PeopleTab({ participants, absent, isHost, canRename, onRename, onPeerAction, onMuteAll, myName, hidePictures }) {
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(myName);
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--s-muted)]">In the meeting · {participants.length}</div>
        <div className="space-y-1">
          {participants.map((p) => (
            <div key={p.id} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/[0.04]">
              {hidePictures ? <div className="grid h-[34px] w-[34px] place-items-center rounded-full bg-white/10 text-xs">{p.name.slice(0, 1)}</div> : <Avatar name={p.name} size={34} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.name}{p.isLocal ? " (Me)" : ""}</div>
                {p.host && <div className="text-[11px] font-semibold text-[#f1a7ab]">Host</div>}
              </div>
              {p.hand && <Hand size={16} className="text-[#f59f00]" />}
              {p.sharing && <MonitorUp size={16} className="text-[#63e6be]" />}
              {isHost && !p.isLocal ? (
                <div className="flex gap-1">
                  <button title={p.muted ? "Ask to unmute" : "Mute"} onClick={() => onPeerAction(p, p.muted ? "askUnmute" : "mute")} className="rounded-md bg-white/[0.07] p-1.5 hover:bg-white/15">{p.muted ? <MicOff size={14} className="text-[#ff8787]" /> : <Mic size={14} className="text-[#63e6be]" />}</button>
                  <button title="Stop video" onClick={() => onPeerAction(p, "stopVideo")} className="rounded-md bg-white/[0.07] p-1.5 hover:bg-white/15">{p.videoOff ? <VideoOff size={14} className="text-[#ff8787]" /> : <Video size={14} />}</button>
                  <button title="Remove" onClick={() => confirm(`Remove ${p.name} from the meeting?`) && onPeerAction(p, "remove")} className="rounded-md bg-white/[0.07] p-1.5 text-[#ff8787] hover:bg-white/15"><X size={14} /></button>
                </div>
              ) : (
                <>
                  {p.muted ? <MicOff size={16} className="text-[#ff8787]" /> : <Mic size={16} className="text-[#63e6be]" />}
                  {p.videoOff ? <VideoOff size={16} className="text-[#ff8787]" /> : <Video size={16} className="text-[var(--s-muted)]" />}
                </>
              )}
            </div>
          ))}
        </div>
        {absent.length > 0 && (
          <>
            <div className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-[var(--s-muted)]">Invited · not joined</div>
            {absent.map((a) => (
              <div key={a} className="flex items-center gap-3 rounded-xl px-2 py-2 opacity-60">
                <Avatar name={a} size={34} />
                <span className="text-sm">{a}</span>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="flex gap-2 border-t border-[var(--s-line)] p-3">
        {editing ? (
          <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) onRename(newName.trim()); setEditing(false); }}>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9 flex-1 rounded-lg border border-[var(--s-line)] bg-[var(--s-raised)] px-3 text-sm outline-none" />
            <button className="rounded-lg bg-[#c2353d] px-3 text-xs font-bold">Save</button>
          </form>
        ) : (
          <>
            {canRename && <button onClick={() => { setNewName(myName); setEditing(true); }} className="h-9 flex-1 rounded-lg bg-white/[0.07] text-xs font-semibold hover:bg-white/15">Rename</button>}
            {isHost && <button onClick={onMuteAll} className="h-9 flex-1 rounded-lg bg-white/[0.07] text-xs font-semibold hover:bg-white/15">Mute All</button>}
          </>
        )}
      </div>
    </div>
  );
}
