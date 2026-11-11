"use client";
import { canCreate, isStaff, isTeamHead } from "@/lib/permissions";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Hash, LogIn, Pencil, Video } from "lucide-react";
import { Modal, Spinner } from "./ui";
import { useToast } from "./Providers";
import { useAuth, displayName } from "@/lib/auth";
import { createMeeting, findMeeting, toDate, updateMeeting } from "@/lib/meetings";
import { access } from "@/lib/access-client";
import { Timestamp } from "firebase/firestore";

export function JoinDialog({ open, onClose, prefill = "" }) {
  const router = useRouter();
  const toast = useToast();
  const [code, setCode] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const go = async (e) => {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    const m = await findMeeting(code).catch(() => null);
    setBusy(false);
    if (!m) return toast("We couldn't find that meeting. Check the code and try again.", "error");
    onClose();
    router.push(`/room/${m.id}`);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join a meeting"
      icon={<LogIn size={20} />}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={go} disabled={busy || !code.trim()}>
            {busy ? <Spinner size={16} /> : null} Join
          </button>
        </>
      }
    >
      <form onSubmit={go} className="space-y-3">
        <label className="text-sm font-medium text-ink-2">Meeting code or invite link</label>
        <div className="relative">
          <Hash size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input autoFocus className="input pl-10 font-mono" placeholder="cnt-1234-5678" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <p className="text-xs text-muted">Your words are transcribed live once you join and unmute.</p>
      </form>
    </Modal>
  );
}

export function NewMeetingDialog({ open, onClose, schedule = false }) {
  const router = useRouter();
  const toast = useToast();
  const { user, profile } = useAuth();
  const [title, setTitle] = useState("");
  const [agenda, setAgenda] = useState("");
  const [participants, setParticipants] = useState("");
  const [when, setWhen] = useState("");
  const [audience, setAudience] = useState("");
  const [teams, setTeams] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    if (!open || !profile?.isActive) return () => { current = false; };
    access("teams").then(result => { if (current) setTeams(Array.isArray(result.teams) ? result.teams : []); }).catch(() => { if (current) setTeams([]); });
    return () => { current = false; };
  }, [open, profile?.isActive]);

  const teamHead = isTeamHead(profile);
  const availableTeams = teamHead ? teams.filter(team => team.id === profile?.teamId) : isStaff(profile) ? teams : teams.filter(team => team.id === profile?.teamId);
  const selectedTeamId = availableTeams.some(team => team.id === audience) ? audience : availableTeams[0]?.id || profile?.teamId || "";
  const selectedGroup = isStaff(profile) && !teamHead && audience === "board" ? "board" : selectedTeamId;

  const submit = async (e) => {
    e?.preventDefault();
    if (!canCreate(profile)) return toast("Only team leads and administrators can create meetings.", "error");
    if (schedule && !when) return toast("Pick a date and time", "error");
    setBusy(true);
    try {
      const host = displayName(user, profile);
      const scope = isStaff(profile) && !teamHead && audience === "board" ? "board" : "team";
      const { id } = await createMeeting({
        title: title.trim() || (schedule ? "Scheduled meeting" : `${host.split(" ")[0]}'s meeting`),
        agenda: agenda.trim(),
        participants: participants.split(",").map((s) => s.trim()).filter(Boolean).join(", "),
        scheduledAt: schedule ? new Date(when) : null,
        hostName: host,
        scope,
        teamId: scope === "team" ? (isStaff(profile) ? selectedTeamId : profile.teamId) : "",
      });
      onClose();
      setTitle("");
      setAgenda("");
      setParticipants("");
      setWhen("");
      if (schedule) toast("Meeting scheduled", "success");
      else router.push(`/room/${id}`);
    } catch (err) {
      toast(`Could not create meeting: ${err.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      title={schedule ? "Schedule a meeting" : "Start a new meeting"}
      icon={schedule ? <CalendarPlus size={20} /> : <Video size={20} />}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy && <Spinner size={16} />} {schedule ? "Schedule" : "Start meeting"}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Meeting group">
          <select className="input" value={selectedGroup} onChange={e => setAudience(e.target.value)} disabled={!availableTeams.length && !isStaff(profile)}>
            {availableTeams.map(team => <option key={team.id} value={team.id}>{team.name || team.id}</option>)}
            {isStaff(profile) && !teamHead && <option value="board">Board members</option>}
          </select>
        </Field>
        <Field label="Title">
          <input autoFocus className="input" placeholder="Weekly product sync" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {schedule && (
          <Field label="Date & time">
            <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        )}
        <Field label="Agenda" hint="Optional — shown on the minutes">
          <textarea rows={3} className="input resize-none" placeholder="What should this meeting decide?" value={agenda} onChange={(e) => setAgenda(e.target.value)} />
        </Field>
        <Field label="Participants" hint="Comma separated names">
          <input className="input" placeholder="Priya, Ravi, Alex" value={participants} onChange={(e) => setParticipants(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-baseline justify-between text-sm font-medium text-ink-2">
        {label}
        {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function EditMeetingDialog({ open, onClose, meeting, onSaved }) {
  const toast = useToast();
  const { user } = useAuth();
  const [title, setTitle] = useState(meeting?.title || "");
  const [agenda, setAgenda] = useState(meeting?.agenda || "");
  const [participants, setParticipants] = useState(meeting?.participants || "");
  const [when, setWhen] = useState(
    meeting?.scheduledAt ? new Date(toDate(meeting.scheduledAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""
  );
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (!meeting?.id) return;
    setBusy(true);
    try {
      const data = {
        title: title.trim() || "Untitled meeting",
        agenda: agenda.trim(),
        participants: participants.split(",").map((s) => s.trim()).filter(Boolean).join(", "),
      };
      if (meeting.meetingType === "scheduled") data.scheduledAt = when ? Timestamp.fromDate(new Date(when)) : null;
      await updateMeeting(meeting.id, data, user);
      toast("Meeting updated successfully", "success");
      onSaved?.();
      onClose();
    } catch (err) {
      toast(`Could not update meeting: ${err.message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      title="Edit meeting"
      icon={<Pencil size={20} />}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy && <Spinner size={16} />} Save changes
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Title">
          <input autoFocus className="input" placeholder="Meeting title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {meeting?.meetingType === "scheduled" && (
          <Field label="Date & time">
            <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        )}
        <Field label="Agenda" hint="Optional — shown on the minutes">
          <textarea rows={3} className="input resize-none" placeholder="Meeting agenda" value={agenda} onChange={(e) => setAgenda(e.target.value)} />
        </Field>
        <Field label="Participants" hint="Comma separated names">
          <input className="input" placeholder="Priya, Ravi, Alex" value={participants} onChange={(e) => setParticipants(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}
