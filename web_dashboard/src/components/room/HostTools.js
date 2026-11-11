"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Hand, MicOff, PenLine, Sparkles, UserMinus, VideoOff, X } from "lucide-react";
import { Switch } from "./Menus";
import { Avatar } from "../ui";
import { useAuth } from "@/lib/auth";

/** Zoom-style Host tools: security toggles, participant permissions and advanced settings. */
export default function HostTools({ controls, setControl, onClose, participants, onSuspend, onMuteAll, onStopAllVideo, onLowerHands, onPeerAction, onOpenSummary, onOpenWhiteboard, onShowCaptions, captionsOn, meetingId, startPage = "main" }) {
  const [page, setPage] = useState(startPage);
  useEffect(() => setPage(startPage), [startPage]);
  const title = { main: "Host tools", participants: "Participants", advanced: "Advanced", ai: "AI", notes: "My Notes", share: "Share", captions: "Captions", whiteboards: "Whiteboards" }[page];
  const back = page === "main" ? null : ["participants", "advanced"].includes(page) ? "main" : "advanced";

  return (
    <aside className="flex h-full w-full flex-col rounded-2xl border border-[var(--s-line)] bg-[#1f1f21] md:w-[380px]">
      <div className="flex items-center gap-2 px-4 py-4">
        {back ? (
          <button onClick={() => setPage(back)} className="rounded-lg p-1 text-white/80 hover:bg-white/10"><ChevronLeft size={20} /></button>
        ) : <span className="w-7" />}
        <h3 className="flex-1 text-center text-[16px] font-bold">{title}</h3>
        <button onClick={onClose} className="rounded-lg p-1 text-white/80 hover:bg-white/10"><X size={20} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {page === "main" && (
          <>
            <Row label="Enable waiting room"><Switch on={controls.waitingRoom} onChange={(v) => setControl({ waitingRoom: v })} /></Row>
            <Row label="Lock Meeting"><Switch on={controls.locked} onChange={(v) => setControl({ locked: v })} /></Row>
            <Row label="Hide profile pictures"><Switch on={controls.hidePictures} onChange={(v) => setControl({ hidePictures: v })} /></Row>
            <Divider />
            <Nav onClick={() => setPage("participants")}>Participants</Nav>
            <Nav onClick={() => setPage("advanced")}>Advanced</Nav>
          </>
        )}

        {page === "participants" && (
          <>
            <button onClick={onSuspend} className="w-full rounded-lg px-3 py-3 text-left text-[15px] font-medium text-[#ff6b6b] hover:bg-white/5">Suspend Participant Activities</button>
            <Divider />
            <div className="px-3 pb-1 pt-2 text-sm text-white/55">Allow participants to:</div>
            <Row label="Chat"><Switch on={controls.allowChat} onChange={(v) => setControl({ allowChat: v })} /></Row>
            <Row label="Rename Themselves"><Switch on={controls.allowRename} onChange={(v) => setControl({ allowRename: v })} /></Row>
            <Row label="Unmute Themselves"><Switch on={controls.allowUnmute} onChange={(v) => setControl({ allowUnmute: v })} /></Row>
            <Row label="Start Video"><Switch on={controls.allowVideo} onChange={(v) => setControl({ allowVideo: v })} /></Row>
            <Divider />
            <div className="grid grid-cols-3 gap-2 px-2 py-2">
              <Small onClick={onMuteAll}><MicOff size={15} /> Mute all</Small>
              <Small onClick={onStopAllVideo}><VideoOff size={15} /> Stop video</Small>
              <Small onClick={onLowerHands}><Hand size={15} /> Lower hands</Small>
            </div>
            <div className="px-3 pb-1 pt-3 text-sm text-white/55">In the meeting ({participants.length})</div>
            {participants.map((p) => <PersonRow key={p.id} p={p} onAction={onPeerAction} />)}
          </>
        )}

        {page === "advanced" && (
          <>
            <Nav onClick={() => setPage("ai")}>AI</Nav>
            <Nav onClick={() => setPage("notes")}>My Notes</Nav>
            <Nav onClick={() => setPage("share")}>Share</Nav>
            <Nav onClick={() => setPage("captions")}>Captions</Nav>
            <Nav onClick={() => setPage("whiteboards")}>Whiteboards</Nav>
          </>
        )}

        {page === "ai" && (
          <>
            <Row label="Allow AI summary for everyone" sub="Participants can catch up with an AI summary of the transcript."><Switch on={controls.aiSummary} onChange={(v) => setControl({ aiSummary: v })} /></Row>
            <div className="px-3 pt-2"><button onClick={onOpenSummary} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold hover:bg-white/15"><Sparkles size={16} /> Open AI summary</button></div>
          </>
        )}

        {page === "notes" && <MyNotes meetingId={meetingId} />}

        {page === "share" && (
          <>
            <div className="px-3 pb-1 pt-2 text-sm text-white/55">Who can share?</div>
            <Choice on={controls.shareHostOnly} onClick={() => setControl({ shareHostOnly: true })}>Only Host</Choice>
            <Choice on={!controls.shareHostOnly} onClick={() => setControl({ shareHostOnly: false })}>All Participants</Choice>
          </>
        )}

        {page === "captions" && (
          <>
            <Row label="Enable live captions" sub="Shows the live transcript as captions for everyone."><Switch on={controls.captions} onChange={(v) => setControl({ captions: v })} /></Row>
            <Row label="Show captions on my screen"><Switch on={captionsOn} onChange={onShowCaptions} /></Row>
          </>
        )}

        {page === "whiteboards" && (
          <>
            <div className="px-3 pb-1 pt-2 text-sm text-white/55">Who can start a whiteboard?</div>
            <Choice on={controls.whiteboardHostOnly} onClick={() => setControl({ whiteboardHostOnly: true })}>Only Host</Choice>
            <Choice on={!controls.whiteboardHostOnly} onClick={() => setControl({ whiteboardHostOnly: false })}>All Participants</Choice>
            <div className="px-3 pt-3"><button onClick={onOpenWhiteboard} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold hover:bg-white/15"><PenLine size={16} /> Open whiteboard</button></div>
          </>
        )}
      </div>
    </aside>
  );
}

function Row({ label, sub, children }) {
  return (
    <div className="flex items-center gap-4 rounded-lg px-3 py-3">
      <div className="flex-1">
        <div className="text-[15px]">{label}</div>
        {sub && <div className="mt-0.5 text-xs text-white/50">{sub}</div>}
      </div>
      {children}
    </div>
  );
}
const Divider = () => <div className="mx-3 my-2 h-px bg-white/10" />;
const Nav = ({ children, onClick }) => (
  <button onClick={onClick} className="flex w-full items-center rounded-lg px-3 py-3.5 text-left text-[15px] hover:bg-white/5">
    <span className="flex-1">{children}</span>
    <ChevronRight size={18} className="text-white/60" />
  </button>
);
const Choice = ({ on, children, onClick }) => (
  <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] hover:bg-white/5">
    <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${on ? "border-[#2d6cdf]" : "border-white/40"}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-[#2d6cdf]" />}</span>
    {children}
  </button>
);
const Small = ({ children, onClick }) => (
  <button onClick={onClick} className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.07] px-2 py-2.5 text-[11.5px] font-semibold hover:bg-white/15">{children}</button>
);

function PersonRow({ p, onAction }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(p.name);
  return (
    <div className="rounded-xl px-3 py-2 hover:bg-white/[0.04]">
      <div className="flex items-center gap-3">
        <Avatar name={p.name} size={30} />
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}{p.isLocal ? " (Host, me)" : ""}</div>
        {p.hand && <Hand size={15} className="text-[#f59f00]" />}
        {!p.isLocal && (
          <div className="flex gap-1">
            <Icon title={p.muted ? "Ask to unmute" : "Mute"} onClick={() => onAction(p, p.muted ? "askUnmute" : "mute")}><MicOff size={14} className={p.muted ? "opacity-50" : ""} /></Icon>
            <Icon title="Stop video" onClick={() => onAction(p, "stopVideo")}><VideoOff size={14} /></Icon>
            <Icon title="Rename" onClick={() => setRenaming((v) => !v)}><PenLine size={14} /></Icon>
            <Icon title="Remove from meeting" danger onClick={() => confirm(`Remove ${p.name} from the meeting?`) && onAction(p, "remove")}><UserMinus size={14} /></Icon>
          </div>
        )}
      </div>
      {renaming && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onAction(p, "rename", name.trim());
            setRenaming(false);
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} className="h-8 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 text-sm outline-none" />
          <button className="rounded-lg bg-[#2d6cdf] px-3 text-xs font-bold">Save</button>
        </form>
      )}
    </div>
  );
}
const Icon = ({ children, onClick, title, danger }) => (
  <button title={title} onClick={onClick} className={`grid h-7 w-7 place-items-center rounded-lg bg-white/[0.07] hover:bg-white/15 ${danger ? "text-[#ff6b6b]" : ""}`}>{children}</button>
);

function MyNotes({ meetingId }) {
  const { user } = useAuth();
  const key = `mm-notes-${meetingId}`;
  const [text, setText] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object" && parsed.text !== undefined) {
            setText(parsed.text);
            return;
          }
        } catch {}
        setText(raw);
      }
    } catch {}
  }, [key]);
  return (
    <div className="px-3">
      <p className="mb-2 text-xs text-white/50">Private to you — saved in this browser.</p>
      <textarea
        value={text}
        onChange={(e) => {
          const val = e.target.value;
          setText(val);
          try {
            localStorage.setItem(
              key,
              JSON.stringify({ text: val, userEmail: (user?.email || "").trim().toLowerCase(), updatedAt: Date.now() })
            );
          } catch {}
        }}
        rows={14}
        placeholder="Write your own notes…"
        className="w-full resize-none rounded-xl border border-white/10 bg-black/30 p-3 text-sm leading-relaxed outline-none focus:border-[#2d6cdf]"
      />
    </div>
  );
}
