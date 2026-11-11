"use client";
import { auth } from "./firebase";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";

const ICE = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
    { urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp"], username: "openrelay", credential: "openrelay" },
  ],
};

/**
 * Firestore-signalled mesh calls, wire-compatible with the mobile app's WebRTCService:
 * meetings/{id}/peers/{peerId} for presence, meetings/{id}/signals {sender, receiver, type, payload}
 * and the lexically smaller peer id creates the offer.
 */
export class MeshCall {
  constructor({ meetingId, peerId, onRemote, onRemoteGone, onPeerJoin, onPeerLeave }) {
    Object.assign(this, { meetingId, peerId, onRemote, onRemoteGone, onPeerJoin, onPeerLeave });
    this.pcs = new Map();
    this.streams = new Map();
    this.early = new Map();
    this.remoteSet = new Set();
    this.local = null;
    this.videoTrack = null;
    this.unsubs = [];
  }

  async start(localStream) {
    this.local = localStream;
    this.videoTrack = localStream.getVideoTracks()[0] || null;
    const sig = query(collection(db, "meetings", this.meetingId, "signals"), where("receiver", "==", this.peerId));
    this.unsubs.push(
      onSnapshot(sig, (snap) => {
        snap.docChanges().forEach((ch) => {
          if (ch.type !== "added") return;
          const data = ch.doc.data();
          deleteDoc(ch.doc.ref).catch(() => {});
          this.handle(data);
        });
      }),
    );
    await setDoc(doc(db, "meetings", this.meetingId, "peers", this.peerId), { uid: auth.currentUser?.uid || "", joinedAt: serverTimestamp(), peerId: this.peerId }, { merge: true });
    this.unsubs.push(
      onSnapshot(collection(db, "meetings", this.meetingId, "peers"), (snap) => {
        snap.docChanges().forEach((ch) => {
          const id = ch.doc.id;
          if (id === this.peerId) return;
          if (ch.type === "added") {
            this.onPeerJoin?.(id);
            if (this.peerId < id) this.offer(id);
          } else if (ch.type === "removed") {
            this.onPeerLeave?.(id);
            this.drop(id);
          }
        });
      }),
    );
  }

  pc(id) {
    if (this.pcs.has(id)) return this.pcs.get(id);
    const pc = new RTCPeerConnection(ICE);
    this.pcs.set(id, pc);
    pc.onicecandidate = (e) => {
      if (e.candidate && e.candidate.candidate) this.send(id, "candidate", { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex });
    };
    pc.ontrack = (e) => {
      let s = e.streams[0];
      if (!s) {
        s = this.streams.get(id) || new MediaStream();
        s.addTrack(e.track);
      }
      this.streams.set(id, s);
      this.onRemote?.(id, s);
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") pc.restartIce?.();
    };
    if (this.local) {
      for (const t of this.local.getTracks()) {
        pc.addTrack(t.kind === "video" && this.videoTrack ? this.videoTrack : t, this.local);
      }
    }
    return pc;
  }

  async offer(id) {
    try {
      const pc = this.pc(id);
      const o = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(o);
      this.send(id, "offer", { sdp: o.sdp, type: o.type });
    } catch (e) {
      console.warn("offer", e);
    }
  }

  async flush(id) {
    const pc = this.pcs.get(id);
    for (const c of this.early.get(id) || []) {
      try {
        await pc.addIceCandidate(c);
      } catch {}
    }
    this.early.delete(id);
  }

  async handle({ sender, type, payload }) {
    if (!sender || sender === this.peerId) return;
    try {
      if (type === "offer") {
        const pc = this.pc(sender);
        await pc.setRemoteDescription({ sdp: payload.sdp, type: payload.type });
        this.remoteSet.add(sender);
        await this.flush(sender);
        const a = await pc.createAnswer();
        await pc.setLocalDescription(a);
        this.send(sender, "answer", { sdp: a.sdp, type: a.type });
      } else if (type === "answer") {
        const pc = this.pcs.get(sender);
        if (!pc) return;
        await pc.setRemoteDescription({ sdp: payload.sdp, type: payload.type });
        this.remoteSet.add(sender);
        await this.flush(sender);
      } else if (type === "candidate" && payload?.candidate) {
        const c = { candidate: payload.candidate, sdpMid: payload.sdpMid, sdpMLineIndex: payload.sdpMLineIndex };
        const pc = this.pcs.get(sender);
        if (pc && this.remoteSet.has(sender)) await pc.addIceCandidate(c).catch(() => {});
        else this.early.set(sender, [...(this.early.get(sender) || []), c]);
      }
    } catch (e) {
      console.warn("signal", type, e);
    }
  }

  send(receiver, type, payload) {
    addDoc(collection(db, "meetings", this.meetingId, "signals"), { uid: auth.currentUser?.uid || "", sender: this.peerId, receiver, type, payload, timestamp: serverTimestamp() }).catch(() => {});
  }

  async replaceVideo(track) {
    this.videoTrack = track;
    for (const pc of this.pcs.values()) {
      for (const s of pc.getSenders()) if (s.track?.kind === "video") await s.replaceTrack(track).catch(() => {});
    }
  }

  async replaceAudio(track) {
    for (const pc of this.pcs.values()) {
      for (const s of pc.getSenders()) if (s.track?.kind === "audio" || (!s.track && track)) {
        if (s.track?.kind === "audio") await s.replaceTrack(track).catch(() => {});
      }
    }
  }

  drop(id) {
    this.remoteSet.delete(id);
    this.early.delete(id);
    this.streams.delete(id);
    this.pcs.get(id)?.close();
    this.pcs.delete(id);
    this.onRemoteGone?.(id);
  }

  async stop() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    for (const id of [...this.pcs.keys()]) this.drop(id);
    await deleteDoc(doc(db, "meetings", this.meetingId, "peers", this.peerId)).catch(() => {});
  }
}
