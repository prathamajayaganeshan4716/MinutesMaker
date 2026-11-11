"use client";
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, Timestamp, updateDoc, where, runTransaction,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { access } from "./access-client";
import { getCurrentProfile } from "./auth";
import { canManage, isStaff } from "./permissions";

function defaultControls() {
  try {
    const s = JSON.parse(localStorage.getItem("mm-settings") || "{}");
    return { waitingRoom: !!s.defaultWaitingRoom, aiSummary: s.defaultAiSummary !== false, whiteboardHostOnly: !!s.whiteboardHostOnly };
  } catch {
    return {};
  }
}

export const meetingCode = () => `cnt-${1000 + Math.floor(Math.random() * 9000)}-${1000 + Math.floor(Math.random() * 9000)}`;

export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v === "number") return new Date(v);
  return null;
}

/** Same document shape as the mobile app's createMeetingDetailed. */
export async function createMeeting({ title, agenda = "", scheduledAt = null, participants = "", hostName, scope = "team", teamId = "", parentId }) {
  return access("meetings", { method: "POST", body: { title, agenda, scheduledAt: scheduledAt?.toISOString() || null, participants, scope, teamId, ...(parentId ? { parentId } : {}) } });
}

export async function findMeeting(codeOrId) {
  const value = (codeOrId || "").trim();
  if (!value) return null;
  const match = value.match(/code=([A-Za-z0-9_-]+)/) || value.match(/room\/([A-Za-z0-9_-]+)/);
  return (await access("lookup", { method: "POST", body: { key: match ? match[1] : value } })).meeting;
}
export function watchMeetings(cb, { minutes = false } = {}) {
  const p = getCurrentProfile();
  if (!p || p.isActive !== true) { cb([]); return () => {}; }
  const collectionName = minutes ? "meetings" : "meeting_rooms";
  let q = query(collection(db, collectionName));
  if (minutes && !isStaff(p)) {
    cb([]); return () => {};
  } else if (!isStaff(p)) {
    const groups = ["member", "guest"].includes(p.role) && p.teamId ? [`team:${p.teamId}`] : [];
    if (!groups.length) { cb([]); return () => {}; }
    q = query(collection(db, collectionName), where("audienceIds", "array-contains-any", groups));
  }
  return onSnapshot(q, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))), () => cb([]));
}
export function watchMeeting(id, cb, { minutes = false } = {}) {
  return onSnapshot(doc(db, minutes ? "meetings" : "meeting_rooms", id), d => cb(d.exists() ? { id: d.id, ...d.data() } : null), () => cb(null));
}

export function isMeetingOwner(m, user) {
  if (!user || !m) return false;
  const userEmail = (user.email || "").trim().toLowerCase();
  const hostEmail = (m.hostEmail || "").trim().toLowerCase();
  const uid = user.uid || "";
  const hostUid = m.hostUid || "";
  return (hostEmail && hostEmail === userEmail) || (hostUid && hostUid === uid);
}

export const canEditMeeting = (m, user) => canManage(getCurrentProfile(), user, m);
export const canDeleteMeeting = canEditMeeting;
export async function updateMeeting(id, data) {
  const value = { ...data };
  if (value.scheduledAt?.toDate) value.scheduledAt = value.scheduledAt.toDate().toISOString();
  return access(`meetings/${id}`, { method: "PATCH", body: value });
}
export const deleteMeeting = (id) => access(`meetings/${id}`, { method: "DELETE" });

export const watchTranscript = (id, cb) =>
  onSnapshot(query(collection(db, "meetings", id, "transcript_segments"), orderBy("sequenceNumber", "asc")), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => cb([]),
  );

export async function getTranscript(id) {
  const s = await getDocs(query(collection(db, "meetings", id, "transcript_segments"), orderBy("sequenceNumber", "asc")));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export const addSegment = (id, seg) =>
  addDoc(collection(db, "meetings", id, "transcript_segments"), { ...seg, meetingId: id, createdAt: serverTimestamp(), authorUid: auth.currentUser?.uid || "" });

export const transcriptText = (segs) => segs.map((s) => `${s.speakerName || "Speaker"}: ${s.text || ""}`).join("\n");

export async function completeMeeting(id, report, transcript) {
  return access(`minutes/${id}`, { method: "PUT", body: { summary: report.summary || "", decisions: report.decisions || "", actionItems: report.actionItems || "", conclusion: report.conclusion || "", summarySource: report.source || "auto", ...(transcript ? { transcript } : {}) } });
}
export async function summarize(transcript) {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch("/api/summarize", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ transcript }) });
  if (!r.ok) throw new Error("Summary unavailable");
  return r.json();
}

// chat
export const watchChat = (id, cb) =>
  onSnapshot(query(collection(db, "meetings", id, "chats"), orderBy("timestamp", "asc")), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
export const sendChat = (id, sender, text) => addDoc(collection(db, "meetings", id, "chats"), { sender, text, authorUid: auth.currentUser?.uid || "", timestamp: serverTimestamp() });

// waiting lobby (guests)
export async function requestLobby(id, name, email = "") {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in first.");
  const ref = doc(db, "meetings", id, "waiting_lobby", uid);
  await setDoc(ref, { name, email, status: "pending", requestedAt: serverTimestamp() });
  return { id: uid };
}
export const watchLobbyDoc = (id, lobbyId, cb) => onSnapshot(doc(db, "meetings", id, "waiting_lobby", lobbyId), (d) => cb(d.data()));
export const watchLobby = (id, cb) =>
  onSnapshot(query(collection(db, "meetings", id, "waiting_lobby"), where("status", "==", "pending")), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
export const setLobbyStatus = (id, lobbyId, status) => updateDoc(doc(db, "meetings", id, "waiting_lobby", lobbyId), { status });

// peers (presence + media state, shared with the mobile app)
export const setPeer = (id, peerId, data) => setDoc(doc(db, "meetings", id, "peers", peerId), { ...data, uid: auth.currentUser?.uid || "", updatedAt: serverTimestamp() }, { merge: true });

export function inviteLink(meeting) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/join?code=${meeting?.meetingCode || meeting?.id || ""}`;
}

// ---------------------------------------------------------------- host controls (Zoom-style)
export const DEFAULT_CONTROLS = {
  waitingRoom: false,
  locked: false,
  hidePictures: false,
  allowChat: true,
  allowRename: true,
  allowUnmute: true,
  allowVideo: true,
  shareHostOnly: false,
  captions: true,
  aiSummary: true,
  whiteboardHostOnly: false,
};
export const controlsOf = (m) => ({ ...DEFAULT_CONTROLS, ...(m?.controls || {}) });
export const setControls = (id, patch) =>
  updateMeeting(id, Object.fromEntries(Object.entries(patch).map(([k, v]) => [`controls.${k}`, v])));

/** One-off command to a single participant (handled by their own browser). */
export const sendCmd = (id, peerId, type, value = null) =>
  setDoc(doc(db, "meetings", id, "peers", peerId), { cmd: { type, value, at: Date.now() } }, { merge: true });

export async function markRemoved(id, key) {
  const snapshot = await getDoc(doc(db, "meeting_rooms", id));
  return updateMeeting(id, { removed: [...new Set([...(snapshot.data()?.removed || []), key])] });
}

// ---------------------------------------------------------------- whiteboard
export const watchStrokes = (id, cb) =>
  onSnapshot(query(collection(db, "meetings", id, "whiteboard"), orderBy("at", "asc")), (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))));
export const addStroke = (id, stroke) => addDoc(collection(db, "meetings", id, "whiteboard"), { ...stroke, authorUid: auth.currentUser?.uid || "", at: Date.now() });
export const removeStroke = (id, sid) => deleteDoc(doc(db, "meetings", id, "whiteboard", sid));
export async function clearStrokes(id) {
  const s = await getDocs(collection(db, "meetings", id, "whiteboard"));
  await Promise.all(s.docs.map((d) => deleteDoc(d.ref)));
}

// ---------------------------------------------------------------- breakout rooms
export async function createBreakouts(parent, count) {
  const out = [];
  for (let i = 1; i <= Math.min(count, 10); i++) {
    const m = await createMeeting({ title: `${parent.title || "Meeting"} · Room ${i}`, scope: parent.scope, teamId: parent.teamId, parentId: parent.id });
    out.push({ id: m.id, name: `Room ${i}` });
  }
  await updateMeeting(parent.id, { breakouts: out, breakoutsOpen: true });
  return out;
}
export async function closeBreakouts(parent) {
  for (const r of parent.breakouts || []) await updateMeeting(r.id, { breakoutClosed: true });
  await updateMeeting(parent.id, { breakoutsOpen: false });
}

// ---------------------------------------------------------------- deletion
export const deleteSegment = (id, segId) => deleteDoc(doc(db, "meetings", id, "transcript_segments", segId));
export async function deleteTranscript(id) {
  return access(`transcripts/${id}`, { method: "DELETE", body: {} });
}

// Retain attendance after ephemeral peer presence is removed on leave.
export async function recordAttendance(id, { uid, email, displayName }) {
  const identity = uid || email?.trim().toLowerCase() || displayName?.trim().toLowerCase();
  if (!identity) throw new Error("Attendance identity unavailable");
  const prefix = uid ? "uid" : email ? "email" : "displayName";
  const ref = doc(db, "meetings", id, "attendance", encodeURIComponent(`${prefix}:${identity}`));
  await setDoc(ref, { uid: uid || "", email: email || "", displayName: displayName || "", joinedAt: serverTimestamp() }, { merge: true });
}
export const watchAttendance = (id, cb) => onSnapshot(collection(db, "meetings", id, "attendance"),
  (s) => cb(s.docs.map((d) => d.data())), () => cb(null));

export const beginMeeting = (id) => updateMeeting(id, { status: "recording" });
export const endMeeting = (id) => updateMeeting(id, { status: "processing" });
