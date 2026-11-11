"use client";
import { access } from "@/lib/access-client";
import { getCurrentProfile } from "@/lib/auth";
import { canReadMinutes } from "@/lib/permissions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import {
  AudioLines, Captions, ChevronUp, Circle, Copy, Grid2x2, Info, MessageSquare, Mic, MicOff, MonitorUp, MoreHorizontal, PanelRight, Pause, Play,
  PenLine, Settings, ShieldCheck, Smile, Sparkles, Square, UserPlus, UserX, Users, Video, VideoOff, X, Headphones,
} from "lucide-react";
import { db } from "@/lib/firebase";
import { MeshCall } from "@/lib/webrtc";
import { LiveTranscriber } from "@/lib/transcriber";
import { MeetingRecorder } from "@/lib/recorder";
import { BackgroundProcessor, getCam, getMic, listDevices } from "@/lib/media";
import { getSettings } from "@/lib/settings";
import { downloadBlob } from "@/lib/recorder";
import {
  beginMeeting, recordAttendance, addSegment, closeBreakouts, completeMeeting, controlsOf, createBreakouts, getTranscript, inviteLink, markRemoved, sendCmd, setControls,
  setLobbyStatus, setPeer, summarize, transcriptText, updateMeeting, watchChat, watchLobby, watchTranscript,
} from "@/lib/meetings";
import { Equalizer, fmtDuration, Logo, Modal, Spinner } from "../ui";
import { useToast } from "../Providers";
import Tile from "./Tile";
import Panel from "./Panel";
import HostTools from "./HostTools";
import { AudioMenu, MoreMenu, ReactMenu, ShareMenu, VideoMenu, ViewMenu, Pop } from "./Menus";
import { BreakoutModal, SettingsModal, Whiteboard } from "./Extras";

const nameOf = (peerId, data) => data?.displayName || (peerId.includes("_") ? peerId.split("_")[0] : peerId);

export default function Room({ meeting, localStream, name, initialCam, initialMic, user, isHost, shareOnStart }) {
  const router = useRouter();
  const toast = useToast();
  const id = meeting.id;
  const peerId = useMemo(() => `${name}_${Date.now()}`, [name]);
  const joinAt = useRef(Date.now());
  const controls = controlsOf(meeting);

  // media
  const [micOn, setMicOn] = useState(initialMic);
  const transcriptPaused = controls.transcriptPaused === true;
  const [camOn, setCamOn] = useState(initialCam);
  const [audioLeft, setAudioLeft] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [selfStream, setSelfStream] = useState(localStream);
  const [devices, setDevices] = useState({ mics: [], cams: [], speakers: [] });
  const [micId, setMicId] = useState(localStream.getAudioTracks()[0]?.getSettings().deviceId || "");
  const [camId, setCamId] = useState(localStream.getVideoTracks()[0]?.getSettings().deviceId || "");
  const [speakerId, setSpeakerId] = useState("");
  const [noise, setNoise] = useState(true);
  const [background, setBackground] = useState("none");
  const [mirror, setMirror] = useState(true);

  // people & layout
  const [myName, setMyName] = useState(name);
  const [remotes, setRemotes] = useState({});
  const [peers, setPeers] = useState({});
  const [view, setView] = useState("speaker");
  const [hideSelf, setHideSelf] = useState(false);
  const [hideNoVideo, setHideNoVideo] = useState(false);
  const [blockVideo, setBlockVideo] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pinned, setPinned] = useState(null);

  // panels & menus
  const [panel, setPanel] = useState(null); // "side" | "host"
  const [tab, setTab] = useState("transcript");
  const [hostPage, setHostPage] = useState("main");
  const [menu, setMenu] = useState(null); // audio | video | react | share | more | view | info
  const [settingsTab, setSettingsTab] = useState(null);
  const [breakoutOpen, setBreakoutOpen] = useState(false);
  const [wbHidden, setWbHidden] = useState(false);

  // meeting state
  const [segments, setSegments] = useState([]);
  const [chat, setChat] = useState([]);
  const [unread, setUnread] = useState(0);
  const [interim, setInterim] = useState("");
  const [tStatus, setTStatus] = useState("idle");
  const [recording, setRecording] = useState(null);
  const [lobby, setLobby] = useState([]);
  const [floating, setFloating] = useState([]);
  const [hand, setHand] = useState(false);
  const [status, setStatus] = useState(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [levels, setLevels] = useState({});
  const [now, setNow] = useState(Date.now());
  const [endOpen, setEndOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [askUnmute, setAskUnmute] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [sharePrompt, setSharePrompt] = useState(!!shareOnStart);

  const mesh = useRef(null);
  const transcriber = useRef(null);
  const transcriptPausedRef = useRef(false);
  const recorder = useRef(null);
  const screen = useRef(null);
  const processor = useRef(null);
  const rawCam = useRef(localStream.getVideoTracks()[0] || null);
  const outVideo = useRef(rawCam.current);
  const videos = useRef(new Map());
  const lastCaption = useRef(0);
  const seenReactions = useRef({});
  const lastCmd = useRef(Date.now());
  const handled = useRef({ muteAll: Date.now(), stopVideoAll: Date.now(), lowerHands: Date.now() });
  const left = useRef(false);
  const settingsRef = useRef({});
  const nameRef = useRef(name);
  nameRef.current = myName;

  const lang = typeof window !== "undefined" ? localStorage.getItem("mm-lang") || "" : "";
  const rebuildSelf = () => setSelfStream(new MediaStream([...localStream.getAudioTracks(), ...(outVideo.current ? [outVideo.current] : [])]));

  // ---------------------------------------------------------------- lifecycle
  useEffect(() => {
    setPanel(window.innerWidth >= 1100 ? "side" : null);
    const st = getSettings();
    settingsRef.current = st;
    setCaptionsOn(st.captions);
    setMirror(st.mirrorVideo);
    setNoise(st.noiseSuppression);
    if (!st.noiseSuppression) localStream.getAudioTracks()[0]?.applyConstraints({ noiseSuppression: false }).catch(() => {});
    const m = new MeshCall({
      meetingId: id,
      peerId,
      onRemote: (pid, stream) => setRemotes((r) => ({ ...r, [pid]: stream })),
      onRemoteGone: (pid) => setRemotes((r) => {
        const n = { ...r };
        delete n[pid];
        return n;
      }),
    });
    mesh.current = m;
    m.start(localStream).then(() =>
      setPeer(id, peerId, { peerId, displayName: name, isMuted: !initialMic, isVideoOff: !initialCam, isScreenSharing: false, caption: "", uid: user?.uid || "", handRaised: false, status: null }),
    );
    beginMeeting(id).catch(() => toast("Meeting start time could not be saved", "error"));
    recordAttendance(id, { uid: user?.uid, email: user?.email, displayName: name })
      .catch(() => toast("Attendance could not be saved; the report may be incomplete", "error"));
    const unPeers = onSnapshot(collection(db, "meetings", id, "peers"), (s) => {
      const p = {};
      s.forEach((d) => (p[d.id] = d.data()));
      setPeers(p);
    });
    const t = setInterval(() => setNow(Date.now()), 1000);
    // closing the tab: chunks are already on disk, the recording is finished on next visit
    const bye = (e) => {
      if (recorder.current) {
        e.preventDefault();
        e.returnValue = "A recording is in progress.";
      }
      mesh.current?.stop();
    };
    window.addEventListener("beforeunload", bye);
    const refresh = () => listDevices().then(setDevices);
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    const fs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fs);
    return () => {
      window.removeEventListener("beforeunload", bye);
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
      document.removeEventListener("fullscreenchange", fs);
      clearInterval(t);
      unPeers();
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = useCallback(async () => {
    if (left.current) return;
    left.current = true;
    transcriber.current?.stop();
    if (recorder.current) await stopRecording(true);
    processor.current?.stop();
    screen.current?.getTracks().forEach((t) => t.stop());
    rawCam.current?.stop();
    localStream.getTracks().forEach((t) => t.stop());
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    await mesh.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream]);

  useEffect(() => watchTranscript(id, setSegments), [id]);
  useEffect(
    () =>
      watchChat(id, (msgs) => {
        setChat((prev) => {
          const fresh = msgs.filter((m) => m.sender !== nameRef.current && !prev.some((p) => p.id === m.id) && (m.timestamp?.toMillis?.() || Date.now()) > joinAt.current - 2000);
          if (fresh.length) {
            setUnread((u) => u + fresh.length);
            const last = fresh[fresh.length - 1];
            toast(`${last.sender}: ${last.text}`);
          }
          return msgs;
        });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  useEffect(() => {
    if (panel === "side" && tab === "chat") setUnread(0);
  }, [panel, tab, chat]);
  useEffect(() => (isHost ? watchLobby(id, setLobby) : undefined), [id, isHost]);

  // Meeting ended by host / breakout rooms closed
  const prevStatus = useRef(meeting.status);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = meeting.status;
    const ended = meeting.status === "processing" || meeting.status === "completed";
    if (!ending && ended && was !== "processing" && was !== "completed") {
      toast("The host ended the meeting");
      cleanup().then(() => router.push(user ? `/minutes/${id}` : "/"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.status]);
  useEffect(() => {
    if (meeting.parentId && meeting.breakoutClosed) {
      toast("Breakout rooms closed — returning to the main meeting");
      cleanup().then(() => router.push(`/room/${meeting.parentId}?quick=1`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.breakoutClosed]);

  // ---------------------------------------------------------------- host-wide controls applied to me
  useEffect(() => {
    if (isHost) return;
    const c = meeting.controls || {};
    if (c.muteAllAt && c.muteAllAt > handled.current.muteAll) {
      handled.current.muteAll = c.muteAllAt;
      if (micOn) {
        setMicOn(false);
        toast("The host muted everyone");
      }
    }
    if (c.stopVideoAllAt && c.stopVideoAllAt > handled.current.stopVideoAll) {
      handled.current.stopVideoAll = c.stopVideoAllAt;
      if (camOn) {
        setCamOn(false);
        toast("The host stopped everyone's video");
      }
    }
    if (c.lowerHandsAt && c.lowerHandsAt > handled.current.lowerHands) {
      handled.current.lowerHands = c.lowerHandsAt;
      if (hand) toggleHand(false);
    }
    if (controls.shareHostOnly && sharing) toggleShare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.controls]);

  // Commands sent to me by the host
  useEffect(() => {
    const me = peers[peerId];
    const cmd = me?.cmd;
    if (!cmd || cmd.at <= lastCmd.current) return;
    lastCmd.current = cmd.at;
    if (cmd.type === "mute") {
      setMicOn(false);
      toast("The host muted you");
    } else if (cmd.type === "askUnmute") setAskUnmute(true);
    else if (cmd.type === "stopVideo") {
      setCamOn(false);
      toast("The host stopped your video");
    } else if (cmd.type === "rename" && cmd.value) {
      setMyName(cmd.value);
      toast(`The host renamed you to ${cmd.value}`);
    } else if (cmd.type === "remove") {
      setRemoved(true);
      cleanup();
    } else if (cmd.type === "breakout" && cmd.value) {
      toast("Moving you to a breakout room…");
      cleanup().then(() => router.push(`/room/${cmd.value}?quick=1`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers]);

  // ---------------------------------------------------------------- mic / transcription
  useEffect(() => {
    localStream.getAudioTracks().forEach((t) => (t.enabled = micOn));
    setPeer(id, peerId, { isMuted: !micOn, caption: "" }).catch(() => {});
    if (micOn && !transcriptPaused && localStream.getAudioTracks().length) {
      if (!transcriber.current)
        transcriber.current = new LiveTranscriber({
          language: lang,
          onStatus: setTStatus,
          onInterim: (txt) => {
            if (transcriptPausedRef.current || !micRef.current) return;
            setInterim(txt);
            const n = Date.now();
            if (n - lastCaption.current > 700 || !txt) {
              lastCaption.current = n;
              setPeer(id, peerId, { caption: txt.slice(-160) }).catch(() => {});
            }
          },
          onFinal: (text, { startedAt, engine }) => {
            if (!transcriptPausedRef.current && micRef.current) addSegment(id, { speakerName: nameRef.current, text, sequenceNumber: startedAt, source: engine });
          },
        });
      transcriber.current.start(localStream);
    } else transcriber.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micOn, transcriptPaused]);

  useEffect(() => {
    if (rawCam.current) rawCam.current.enabled = camOn;
    if (outVideo.current) outVideo.current.enabled = camOn;
    setPeer(id, peerId, { isVideoOff: !camOn }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn]);

  useEffect(() => {
    if (myName !== name || peers[peerId]) setPeer(id, peerId, { displayName: myName }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myName]);

  const toggleMic = () => {
    if (audioLeft) return joinAudio();
    if (!micOn && !isHost && !controls.allowUnmute) return toast("The host has disabled unmuting");
    setMicOn((v) => !v);
  };
  const toggleCam = () => {
    if (!camOn && !isHost && !controls.allowVideo) return toast("The host has disabled starting video");
    if (!rawCam.current) return toast("No camera available");
    setCamOn((v) => !v);
  };

  // ---------------------------------------------------------------- devices
  const swapAudio = async (track) => {
    localStream.getAudioTracks().forEach((t) => {
      localStream.removeTrack(t);
      t.stop();
    });
    if (track) {
      track.enabled = micOn;
      localStream.addTrack(track);
      await mesh.current?.replaceAudio(track);
      recorder.current?.addAudio(`local-${track.id}`, localStream);
    }
    rebuildSelf();
    if (micOn && !transcriptPaused && transcriber.current) {
      transcriber.current.stop();
      transcriber.current.start(localStream);
    }
  };
  const chooseMic = async (deviceId) => {
    setMenu(null);
    try {
      await swapAudio(await getMic(deviceId, noise));
      setMicId(deviceId);
      setAudioLeft(false);
    } catch {
      toast("Could not switch microphone", "error");
    }
  };
  const chooseNoise = async (v) => {
    setNoise(v);
    const t = localStream.getAudioTracks()[0];
    await t?.applyConstraints({ noiseSuppression: v, echoCancellation: true }).catch(() => {});
    toast(v ? "Background noise suppression on" : "Background noise suppression off");
  };
  const leaveAudio = () => {
    setMenu(null);
    swapAudio(null);
    setMicOn(false);
    setAudioLeft(true);
    toast("You left computer audio");
  };
  const joinAudio = async () => {
    try {
      await swapAudio(await getMic(micId, noise));
      setAudioLeft(false);
    } catch {
      toast("Microphone unavailable", "error");
    }
  };
  const chooseSpeaker = (deviceId) => {
    setMenu(null);
    setSpeakerId(deviceId);
  };
  const applyVideo = async (track) => {
    outVideo.current = track;
    localStream.getVideoTracks().forEach((t) => localStream.removeTrack(t));
    if (track) localStream.addTrack(track);
    if (!sharing && track) await mesh.current?.replaceVideo(track);
    rebuildSelf();
  };
  const chooseCam = async (deviceId) => {
    setMenu(null);
    try {
      const t = await getCam(deviceId);
      t.enabled = camOn;
      const old = rawCam.current;
      rawCam.current = t;
      if (background !== "none") await applyVideo(await processor.current.start(t, background));
      else await applyVideo(t);
      old?.stop();
      setCamId(deviceId);
    } catch {
      toast("Could not switch camera", "error");
    }
  };
  const chooseBackground = async (mode) => {
    if (!rawCam.current) return toast("Turn on a camera first");
    try {
      if (mode === "none") {
        processor.current?.stop();
        processor.current = null;
        await applyVideo(rawCam.current);
      } else if (processor.current) {
        processor.current.setMode(mode);
      } else {
        toast("Preparing background effects…");
        processor.current = new BackgroundProcessor();
        const t = await processor.current.start(rawCam.current, mode);
        t.enabled = camOn;
        await applyVideo(t);
      }
      setBackground(mode);
    } catch (e) {
      console.warn(e);
      processor.current = null;
      toast("Background effects aren't supported on this device", "error");
    }
  };

  // ---------------------------------------------------------------- active speaker detection
  const remotesRef = useRef(remotes);
  remotesRef.current = remotes;
  const micRef = useRef(micOn);
  micRef.current = micOn;
  transcriptPausedRef.current = transcriptPaused;
  const transcriptActive = micOn && !transcriptPaused;
  useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const an = new Map();
    const add = (key, stream) => {
      const tr = stream?.getAudioTracks()[0];
      if (!tr || an.get(key)?.id === tr.id) return;
      try {
        const a = ctx.createAnalyser();
        a.fftSize = 256;
        ctx.createMediaStreamSource(new MediaStream([tr])).connect(a);
        an.set(key, { a, id: tr.id });
      } catch {}
    };
    const iv = setInterval(() => {
      add(peerId, localStream);
      Object.entries(remotesRef.current).forEach(([k, s]) => add(k, s));
      const buf = new Uint8Array(128);
      const out = {};
      an.forEach(({ a }, k) => {
        a.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += (v - 128) ** 2;
        out[k] = Math.sqrt(sum / buf.length);
      });
      if (!micRef.current) out[peerId] = 0;
      setLevels(out);
    }, 300);
    return () => {
      clearInterval(iv);
      ctx.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const speaking = (k) => (levels[k] || 0) > 6;

  // ---------------------------------------------------------------- reactions & status
  useEffect(() => {
    Object.entries(peers).forEach(([k, p]) => {
      const r = p.reaction;
      if (r?.at && r.at > joinAt.current && seenReactions.current[k] !== r.at) {
        seenReactions.current[k] = r.at;
        spawn(r.emoji, nameOf(k, p));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peers]);
  const spawn = (emoji, who) => {
    const key = Math.random().toString(36).slice(2);
    setFloating((f) => [...f, { key, emoji, who, left: 6 + Math.random() * 30 }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.key !== key)), 3200);
  };
  const react = (emoji) => {
    setMenu(null);
    spawn(emoji, "You");
    setPeer(id, peerId, { reaction: { emoji, at: Date.now() } }).catch(() => {});
  };
  function toggleHand(v) {
    const next = typeof v === "boolean" ? v : !hand;
    setHand(next);
    setPeer(id, peerId, { handRaised: next }).catch(() => {});
  }
  const setMyStatus = (s) => {
    setStatus(s);
    setPeer(id, peerId, { status: s }).catch(() => {});
    if (s === "brb" && camOn) setCamOn(false);
  };

  // ---------------------------------------------------------------- screen share
  const canShare = isHost || !controls.shareHostOnly;
  async function toggleShare() {
    setSharePrompt(false);
    setMenu(null);
    if (sharing) {
      screen.current?.getTracks().forEach((t) => t.stop());
      screen.current = null;
      if (outVideo.current) await mesh.current.replaceVideo(outVideo.current);
      setSharing(false);
      setPeer(id, peerId, { isScreenSharing: false }).catch(() => {});
      return;
    }
    if (!canShare) return toast("Only the host can share right now");
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: false });
      screen.current = s;
      const track = s.getVideoTracks()[0];
      track.onended = () => {
        if (screen.current === s) toggleShareRef.current();
      };
      await mesh.current.replaceVideo(track);
      setSharing(true);
      setPeer(id, peerId, { isScreenSharing: true }).catch(() => {});
    } catch {}
  }
  const toggleShareRef = useRef(toggleShare);
  toggleShareRef.current = toggleShare;

  // ---------------------------------------------------------------- recording
  const tilesRef = useRef([]);
  const startRecording = async () => {
    if (recorder.current) return;
    try {
      const r = new MeetingRecorder({ title: meeting.title, meetingId: id, getTiles: () => tilesRef.current, userEmail: user?.email, userUid: user?.uid, hostEmail: meeting?.hostEmail, hostUid: meeting?.hostUid });
      recorder.current = r;
      r.addAudio("local", localStream);
      Object.entries(remotes).forEach(([k, s]) => r.addAudio(k, s));
      await r.start();
      setRecording({ at: r.startedAt });
      updateMeeting(id, { recording: { by: myName, at: Date.now() } }).catch(() => {});
      toast("Recording started — it runs until you stop it or the meeting ends");
    } catch {
      recorder.current = null;
      toast("Recording isn't supported in this browser", "error");
    }
  };
  async function stopRecording(silent) {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    setRecording(null);
    updateMeeting(id, { recording: null }).catch(() => {});
    if (!silent) toast("Saving recording…");
    const rec = await r.stop().catch(() => null);
    if (!rec) return toast("Recording could not be saved", "error");
    if (settingsRef.current.autoDownloadRecording) downloadBlob(rec.blob, `${(meeting.title || "meeting").replace(/[^\w-]+/g, "_")}-${new Date(rec.createdAt).toISOString().slice(0, 16).replace(/[:T]/g, "-")}.webm`);
    toast(`Recording saved (${fmtRec(rec.duration)}) — find it in Recordings`, "success");
  }
  useEffect(() => {
    if (!recorder.current) return;
    Object.entries(remotes).forEach(([k, s]) => recorder.current.addAudio(k, s));
  }, [remotes]);

  // ---------------------------------------------------------------- host actions
  const setControl = (patch) => setControls(id, patch).catch(() => toast("Could not update setting", "error"));
  const peerAction = async (p, type, value) => {
    if (type === "remove") {
      await markRemoved(id, peers[p.id]?.uid || p.name).catch(() => {});
      toast(`${p.name} was removed`);
    }
    await sendCmd(id, p.id, type, value ?? null).catch(() => {});
    if (type === "rename") toast(`Renamed to ${value}`);
  };
  const muteAll = () => {
    setControl({ muteAllAt: Date.now() });
    toast("Everyone except you was muted");
  };
  const stopAllVideo = () => setControl({ stopVideoAllAt: Date.now() });
  const lowerHands = () => setControl({ lowerHandsAt: Date.now() });
  const suspend = () => {
    if (!confirm("Suspend participant activities? Everyone is muted, video stops, chat and sharing are disabled and the meeting is locked.")) return;
    setControl({ allowChat: false, allowRename: false, allowUnmute: false, allowVideo: false, shareHostOnly: true, locked: true, muteAllAt: Date.now(), stopVideoAllAt: Date.now() });
    toast("Participant activities suspended");
  };
  const openBreakouts = async (count, assign) => {
    const rooms = await createBreakouts(meeting, count);
    for (const [pid, n] of Object.entries(assign)) await sendCmd(id, pid, "breakout", rooms[n - 1]?.id).catch(() => {});
    toast(`${count} breakout rooms opened`);
  };
  const startWhiteboard = () => {
    setMenu(null);
    if (!isHost && controls.whiteboardHostOnly) return toast("Only the host can start a whiteboard");
    setWbHidden(false);
    updateMeeting(id, { whiteboard: { active: true, by: myName } }).catch(() => {});
  };

  // ---------------------------------------------------------------- leave / end
  const leave = async () => {
    if (!isHost && settingsRef.current.confirmLeave && !confirm("Leave this meeting?")) return;
    await cleanup();
    router.push(canReadMinutes(getCurrentProfile(), meeting) ? `/minutes/${id}` : "/dashboard");
  };
  const endForAll = async () => {
    setEnding(true);
    try {
      await access(`finalize/${id}`, { method: "POST", body: { autoMinutes: settingsRef.current.autoMinutes !== false } });
      await cleanup();
      router.push(canReadMinutes(getCurrentProfile(), meeting) ? `/minutes/${id}` : "/dashboard");
    } catch (error) { toast(error.message || "Could not finish meeting", "error"); setEnding(false); }
  };

  // ---------------------------------------------------------------- derived tiles / people
  const register = useCallback((k, el) => {
    if (el) videos.current.set(k, el);
    else videos.current.delete(k);
  }, []);

  const allTiles = useMemo(() => {
    const list = [{ id: peerId, stream: sharing ? screen.current : selfStream, name: myName, isLocal: true, muted: !micOn, videoOff: !camOn, sharing, hand, status, isHost }];
    const ids = new Set([...Object.keys(remotes), ...Object.keys(peers)]);
    ids.delete(peerId);
    for (const k of ids) {
      const p = peers[k];
      if (!p && !remotes[k]) continue;
      list.push({ id: k, stream: remotes[k] || null, name: nameOf(k, p), muted: p?.isMuted === true, videoOff: p?.isVideoOff === true, sharing: p?.isScreenSharing === true, hand: p?.handRaised === true, status: p?.status || null, isHost: !!p?.uid && p.uid === meeting.hostUid });
    }
    return list;
  }, [peerId, sharing, selfStream, myName, micOn, camOn, hand, status, isHost, remotes, peers, meeting.hostUid]);
  tilesRef.current = allTiles.map((t) => ({ video: videos.current.get(t.id), name: t.name, videoOff: t.videoOff && !t.sharing }));

  let tiles = allTiles;
  if (hideSelf && tiles.length > 1) tiles = tiles.filter((t) => !t.isLocal);
  if (hideNoVideo) {
    const v = tiles.filter((t) => !t.videoOff || t.sharing);
    if (v.length) tiles = v;
  }
  const sharer = tiles.find((t) => t.sharing);
  const others = tiles.filter((t) => !t.isLocal);
  const byLevel = [...others].sort((a, b) => (levels[b.id] || 0) - (levels[a.id] || 0));
  const main = tiles.find((t) => t.id === pinned) || sharer || (byLevel[0] && speaking(byLevel[0].id) ? byLevel[0] : null) || others[0] || tiles[0];
  const multi = (view === "multi" ? [...byLevel.slice(0, 4)] : []).concat(view === "multi" && byLevel.length < 4 ? tiles.filter((t) => t.isLocal) : []).slice(0, 4);

  const participants = allTiles.map((t) => ({ ...t, host: t.isHost }));
  const invited = (meeting.participants || "").split(",").map((s) => s.trim()).filter(Boolean);
  const absent = invited.filter((n) => !participants.some((p) => p.name.toLowerCase() === n.toLowerCase()));
  const captions = useMemo(() => {
    const c = {};
    Object.entries(peers).forEach(([k, p]) => {
      if (k !== peerId && p.caption) c[nameOf(k, p)] = p.caption;
    });
    return c;
  }, [peers, peerId]);
  const lastSeg = segments[segments.length - 1];
  const lastLine = interim ? [myName, interim] : Object.entries(captions)[0] || (lastSeg && now - (lastSeg.sequenceNumber || 0) < 30000 ? [lastSeg.speakerName, lastSeg.text] : null);
  const showCaptions = captionsOn && controls.captions && lastLine;
  const startedAt = meeting.startedAt?.toMillis?.() || joinAt.current;
  const recInfo = meeting.recording;
  const wbActive = meeting.whiteboard?.active && !wbHidden;

  const openSide = (t) => {
    setMenu(null);
    if (panel === "side" && tab === t) setPanel(null);
    else {
      setTab(t);
      setPanel("side");
    }
  };
  const openHost = (page = "main") => {
    setMenu(null);
    setHostPage(page);
    setPanel(panel === "host" && page === hostPage ? null : "host");
  };
  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteLink(meeting));
    toast("Invite link copied", "success");
  };
  const tileProps = (t) => ({
    ...t,
    speaking: speaking(t.id) && !t.muted,
    register,
    mirror: t.isLocal && !t.sharing && mirror,
    hidePictures: controls.hidePictures,
    blockVideo,
    sinkId: speakerId,
  });

  if (removed)
    return (
      <div className="studio fixed inset-0 grid place-items-center text-center">
        <div>
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/5"><UserX size={28} /></div>
          <div className="mt-5 font-display text-2xl font-bold">You were removed from this meeting</div>
          <p className="mt-2 text-[var(--s-muted)]">The host removed you. You can't rejoin this meeting.</p>
          <button onClick={() => router.push("/dashboard")} className="btn btn-primary mt-6">Back to home</button>
        </div>
      </div>
    );

  const gridCols = tiles.length <= 1 ? "grid-cols-1" : tiles.length <= 4 ? "grid-cols-2" : tiles.length <= 9 ? "grid-cols-3" : "grid-cols-4";

  return (
    <div className="studio fixed inset-0 flex flex-col">
      {/* Top bar */}
      <header className="relative flex h-[52px] shrink-0 items-center gap-3 px-3 md:px-4">
        <button onClick={() => setMenu(menu === "info" ? null : "info")} className="rounded-full p-1 text-white/80 hover:bg-white/10" title="Meeting information"><Info size={18} /></button>
        <div className="min-w-0 truncate text-[14px] font-bold">{meeting.title || "Meeting"}</div>
        <Pop open={menu === "info"} onClose={() => setMenu(null)} className="left-3 top-[48px] w-[340px] p-4">
          <div className="flex items-center gap-3"><Logo withName={false} size={34} /><div className="min-w-0"><div className="truncate font-bold">{meeting.title}</div><div className="text-xs text-white/50">Host · {meeting.hostName || "—"}</div></div></div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-white/50">Meeting ID</span><span className="font-mono">{meeting.meetingCode || id.slice(0, 10)}</span></div>
            <div className="flex justify-between"><span className="text-white/50">Duration</span><span className="font-mono">{fmtDuration(now - startedAt)}</span></div>
            <div className="break-all rounded-lg bg-white/[0.06] p-2.5 font-mono text-xs text-white/70">{inviteLink(meeting)}</div>
          </div>
          <button onClick={copyInvite} className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#2d6cdf] text-sm font-semibold"><Copy size={15} /> Copy invite link</button>
        </Pop>
        <div className="ml-2 hidden items-center gap-2 sm:flex">
          {settingsRef.current.showTimer !== false && <span className="rounded-md bg-white/[0.06] px-2 py-1 font-mono text-xs text-[var(--s-muted)]">{fmtDuration(now - startedAt)}</span>}
          {(recording || recInfo) && (
            <span className="flex items-center gap-1.5 rounded-md bg-[#e03131]/20 px-2 py-1 text-xs font-bold text-[#ff8787]">
              <span className="live-dot h-2 w-2 rounded-full bg-[#e03131]" style={{ color: "#e03131" }} /> REC{recInfo?.by && !recording ? ` · ${recInfo.by}` : ""}
            </span>
          )}
          <span className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold ${transcriptActive ? "bg-[#1f9d6b]/20 text-[#63e6be]" : "bg-white/[0.06] text-[var(--s-muted)]"}`}>
            {transcriptActive ? <Equalizer color="#63e6be" height={11} active={tStatus !== "idle"} /> : <AudioLines size={13} />}
            {transcriptActive ? (tStatus === "transcribing" ? "Transcribing" : "Live transcript") : "Transcript paused"}
          </span>
          {controls.locked && <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs text-[var(--s-muted)]">🔒 Locked</span>}
        </div>
        <div className="ml-auto flex items-center gap-1">
          {isHost && <button onClick={() => openHost("main")} title="Security · Host tools" className="rounded-lg p-2 text-[#51cf66] hover:bg-white/10"><ShieldCheck size={19} /></button>}
          {(controls.aiSummary || isHost) && <button onClick={() => openSide("summary")} title="AI summary" className="rounded-lg p-2 text-white/85 hover:bg-white/10"><Sparkles size={18} /></button>}
          <div className="mx-1 h-5 w-px bg-white/15" />
          <div className="relative">
            <button onClick={() => setMenu(menu === "view" ? null : "view")} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10" title="View"><Grid2x2 size={16} /> View</button>
            <ViewMenu open={menu === "view"} onClose={() => setMenu(null)} view={view} setView={setView} hideSelf={hideSelf} setHideSelf={setHideSelf} hideNoVideo={hideNoVideo} setHideNoVideo={setHideNoVideo} isFullscreen={fullscreen} onFullscreen={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})} />
          </div>
          <button onClick={() => (panel ? setPanel(null) : setPanel("side"))} className={`rounded-lg p-2 ${panel ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/10"}`} title="Side panel"><PanelRight size={17} /></button>
        </div>
      </header>

      {/* Waiting-room requests (host) */}
      {lobby.length > 0 && (
        <div className="mx-3 mb-2 flex flex-wrap items-center gap-3 rounded-xl bg-[#2d6cdf]/15 px-4 py-2 text-sm">
          <UserPlus size={16} className="text-[#91b4ff]" />
          <span className="font-semibold">{lobby.map((l) => l.name).join(", ")}</span>
          <span className="text-[var(--s-muted)]">{lobby.length > 1 ? "are" : "is"} in the waiting room</span>
          <div className="ml-auto flex flex-wrap gap-2">
            {lobby.map((l) => (
              <span key={l.id} className="flex gap-1.5">
                <button className="rounded-lg bg-[#2d6cdf] px-3 py-1 text-xs font-bold text-white" onClick={() => setLobbyStatus(id, l.id, "admitted")}>Admit{lobby.length > 1 ? ` ${l.name}` : ""}</button>
                <button className="rounded-lg bg-white/10 px-3 py-1 text-xs font-bold" onClick={() => setLobbyStatus(id, l.id, "denied")}>Remove</button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
        {/* Stage */}
        <div className="relative flex min-w-0 flex-1 flex-col rounded-2xl bg-[#1a1a1a] p-2">
          {view === "gallery" && !sharer ? (
            <div className={`grid h-full auto-rows-fr gap-2 ${gridCols}`}>
              {tiles.map((t) => <Tile key={t.id} {...tileProps(t)} pinned={pinned === t.id} onPin={() => { setPinned(t.id); setView("speaker"); }} />)}
            </div>
          ) : view === "multi" && !sharer && multi.length > 1 ? (
            <div className="grid h-full auto-rows-fr grid-cols-2 gap-2">
              {multi.map((t) => <Tile key={t.id} {...tileProps(t)} pinned={pinned === t.id} onPin={() => { setPinned(t.id); setView("speaker"); }} />)}
            </div>
          ) : (
            <>
              {tiles.length > 1 && (
                <div className="mb-2 flex h-[112px] shrink-0 justify-center gap-2 overflow-x-auto">
                  {tiles.filter((t) => t.id !== main.id).map((t) => (
                    <div key={t.id} className="aspect-video h-full shrink-0"><Tile {...tileProps(t)} small onPin={() => setPinned(t.id)} /></div>
                  ))}
                </div>
              )}
              <div className="min-h-0 flex-1">
                <Tile key={main.id} {...tileProps(main)} fit={main.sharing ? "contain" : "cover"} pinned={pinned === main.id} onPin={() => setPinned(pinned === main.id ? null : main.id)} />
              </div>
            </>
          )}

          {wbActive && (
            <Whiteboard
              meetingId={id}
              me={myName}
              canClear={isHost || meeting.whiteboard?.by === myName}
              onClose={() => (isHost || meeting.whiteboard?.by === myName ? updateMeeting(id, { whiteboard: { active: false } }) : setWbHidden(true))}
            />
          )}

          {showCaptions && (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-6">
              <div className="max-w-3xl rounded-xl bg-black/75 px-5 py-2.5 text-center text-[15px] leading-relaxed text-white backdrop-blur">
                <span className="mr-2 font-semibold text-[#ffc9cc]">{lastLine[0]}:</span>
                {String(lastLine[1]).slice(-220)}
              </div>
            </div>
          )}

          {sharePrompt && (
            <div className="absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-[#0d0d0e] px-4 py-3 shadow-2xl">
              <MonitorUp size={18} className="text-[#63e6be]" />
              <span className="text-sm">Ready to share your screen?</span>
              <button className="rounded-lg bg-[#1f9d6b] px-3 py-1.5 text-xs font-bold text-white" onClick={toggleShare}>Share now</button>
              <button className="text-xs text-[var(--s-muted)]" onClick={() => setSharePrompt(false)}>Later</button>
            </div>
          )}

          {floating.map((f) => (
            <div key={f.key} className="pointer-events-none absolute bottom-20 z-10 flex flex-col items-center" style={{ left: `${f.left}%`, animation: "rise 3.2s ease-out forwards" }}>
              <span className="text-5xl">{f.emoji}</span>
              <span className="mt-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px]">{f.who}</span>
            </div>
          ))}
        </div>

        {/* Right panel */}
        {panel === "side" && (
          <div className="fixed inset-0 z-30 overflow-hidden rounded-2xl md:static md:z-auto">
            <Panel
              tab={tab}
              setTab={setTab}
              onClose={() => setPanel(null)}
              meetingId={id}
              myName={myName}
              segments={segments}
              interim={interim}
              captions={captions}
              chat={chat}
              unread={unread}
              participants={participants}
              absent={absent}
              status={transcriptActive ? tStatus : "idle"}
              isHost={isHost}
              canChat={controls.allowChat}
              canRename={controls.allowRename}
              aiAllowed={controls.aiSummary}
              onRename={(n) => setMyName(n)}
              onPeerAction={peerAction}
              onMuteAll={muteAll}
              hidePictures={controls.hidePictures}
            />
          </div>
        )}
        {panel === "host" && isHost && (
          <div className="fixed inset-0 z-30 md:static md:z-auto">
            <HostTools
              controls={controls}
              setControl={setControl}
              onClose={() => setPanel(null)}
              participants={participants}
              onSuspend={suspend}
              onMuteAll={muteAll}
              onStopAllVideo={stopAllVideo}
              onLowerHands={lowerHands}
              onPeerAction={peerAction}
              onOpenSummary={() => openSide("summary")}
              onOpenWhiteboard={startWhiteboard}
              onShowCaptions={(v) => setCaptionsOn(v)}
              captionsOn={captionsOn}
              meetingId={id}
              startPage={hostPage}
            />
          </div>
        )}
      </div>

      {/* Toolbar */}
      <footer className="relative flex h-[68px] shrink-0 items-center gap-1 bg-black px-2 md:px-4">
        <div className="flex gap-0.5">
          <Tool label="Audio" caret onCaret={() => setMenu(menu === "audio" ? null : "audio")} onClick={toggleMic} warn={!micOn} disabled={false}>
            {audioLeft ? <Headphones size={22} className="text-[#ff6b6b]" /> : micOn ? <Mic size={22} /> : <MicOff size={22} className="text-[#ff6b6b]" />}
          </Tool>
          <Tool label="Video" caret onCaret={() => setMenu(menu === "video" ? null : "video")} onClick={toggleCam} warn={!camOn}>
            {camOn ? <Video size={22} /> : <VideoOff size={22} className="text-[#ff6b6b]" />}
          </Tool>
        </div>
        <AudioMenu open={menu === "audio"} onClose={() => setMenu(null)} devices={devices} micId={micId} speakerId={speakerId} noise={noise} onMic={chooseMic} onSpeaker={chooseSpeaker} onNoise={chooseNoise} onTest={() => { setMenu(null); setSettingsTab("audio"); }} onLeaveAudio={() => (audioLeft ? (setMenu(null), joinAudio()) : leaveAudio())} onSettings={() => { setMenu(null); setSettingsTab("audio"); }} audioLeft={audioLeft} />
        <VideoMenu open={menu === "video"} onClose={() => setMenu(null)} devices={devices} camId={camId} onCam={chooseCam} background={background} onBlur={(v) => chooseBackground(v ? "blur" : "none")} onChooseBackground={() => { setMenu(null); setSettingsTab("backgrounds"); }} onSettings={() => { setMenu(null); setSettingsTab("video"); }} />

        <div className="relative mx-auto flex gap-0.5 overflow-x-auto md:overflow-visible">
          <Tool label="Participants" badge={allTiles.length} active={panel === "side" && tab === "people"} onClick={() => openSide("people")}><Users size={22} /></Tool>
          <Tool label="Chat" badge={unread || null} badgeRed active={panel === "side" && tab === "chat"} onClick={() => openSide("chat")}><MessageSquare size={22} /></Tool>
          <div className="relative">
            <Tool label="React" active={menu === "react" || hand || !!status} onClick={() => setMenu(menu === "react" ? null : "react")}><Smile size={22} /></Tool>
          </div>
          <div className="relative">
            <Tool label={sharing ? "Stop Share" : "Share"} caret onCaret={() => setMenu(menu === "share" ? null : "share")} active={sharing} green={sharing} onClick={toggleShare}><MonitorUp size={22} /></Tool>
          </div>
          <Tool label={recording ? `Stop ${fmtRec(now - recording.at)}` : "Record"} active={!!recording} onClick={() => (recording ? stopRecording() : startRecording())}>
            {recording ? <Square size={19} className="fill-[#e03131] text-[#e03131]" /> : <Circle size={22} className="text-[#ff6b6b]" />}
          </Tool>
          {isHost && <Tool label={transcriptPaused ? "Resume transcript" : "Pause transcript"} active={transcriptActive} onClick={() => setControl({ transcriptPaused: !transcriptPaused })}>
            {transcriptPaused ? <Play size={21} /> : <Pause size={21} />}
          </Tool>}
          <Tool label="Transcript" active={panel === "side" && tab === "transcript"} onClick={() => openSide("transcript")}><AudioLines size={22} /></Tool>
          {isHost && <Tool label="Host tools" active={panel === "host"} onClick={() => openHost("main")}><ShieldCheck size={22} /></Tool>}
          <Tool label="More" active={menu === "more"} onClick={() => setMenu(menu === "more" ? null : "more")}><MoreHorizontal size={22} /></Tool>
        </div>
        <ReactMenu open={menu === "react"} onClose={() => setMenu(null)} onEmoji={react} status={status} onStatus={(s) => { setMyStatus(s); setMenu(null); }} hand={hand} onHand={() => { toggleHand(); setMenu(null); }} onBrb={() => { setMyStatus(status === "brb" ? null : "brb"); setMenu(null); }} />
        <ShareMenu open={menu === "share"} onClose={() => setMenu(null)} sharing={sharing} onShare={toggleShare} isHost={isHost} hostOnly={controls.shareHostOnly} onHostOnly={(v) => setControl({ shareHostOnly: v })} canShare={canShare} />
        <MoreMenu
          open={menu === "more"}
          onClose={() => setMenu(null)}
          items={[
            { icon: Captions, label: captionsOn ? "Hide Captions" : "Show Captions", onClick: () => { setCaptionsOn((v) => !v); setMenu(null); }, active: captionsOn, disabled: !controls.captions },
            isHost && { icon: Grid2x2, label: "Breakout Rooms", onClick: () => { setMenu(null); setBreakoutOpen(true); } },
            { icon: PenLine, label: "Whiteboards", onClick: startWhiteboard, disabled: !isHost && controls.whiteboardHostOnly },
            { icon: Settings, label: "Settings", onClick: () => { setMenu(null); setSettingsTab("general"); } },
            { icon: VideoOff, label: blockVideo ? "Start Incoming Video" : "Stop Incoming Video", onClick: () => { setBlockVideo((v) => !v); setMenu(null); }, active: blockVideo },
            (controls.aiSummary || isHost) && { icon: Sparkles, label: "AI Summary", onClick: () => openSide("summary") },
          ]}
        />

        <button onClick={() => (isHost ? setEndOpen(true) : leave())} className="flex w-[74px] shrink-0 flex-col items-center gap-1 rounded-xl py-1.5 text-[11.5px] font-medium text-white hover:bg-white/[0.06]">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#e03131]"><X size={18} strokeWidth={3} /></span>
          {isHost ? "End" : "Leave"}
        </button>
      </footer>

      <Modal open={endOpen} onClose={() => setEndOpen(false)} title="End this meeting?" icon={<X size={19} />}>
        <p className="text-sm text-muted">Ending for everyone closes the call and writes the minutes from the transcript.</p>
        <div className="mt-5 grid gap-2">
          <button className="btn btn-danger h-11" onClick={endForAll} disabled={ending}>{ending ? <Spinner size={16} /> : null} End Meeting for All</button>
          <button className="btn btn-ghost h-11" onClick={leave} disabled={ending}>Leave Meeting</button>
        </div>
      </Modal>

      <Modal open={askUnmute} onClose={() => setAskUnmute(false)} title="The host would like you to unmute" icon={<Mic size={19} />}>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setAskUnmute(false)}>Stay Muted</button>
          <button className="btn btn-primary" onClick={() => { setAskUnmute(false); if (audioLeft) joinAudio(); setMicOn(true); }}>Unmute</button>
        </div>
      </Modal>

      <SettingsModal
        open={!!settingsTab}
        tab={settingsTab || "audio"}
        onClose={() => setSettingsTab(null)}
        devices={devices}
        micId={micId}
        camId={camId}
        speakerId={speakerId}
        onMic={chooseMic}
        onCam={chooseCam}
        onSpeaker={chooseSpeaker}
        noise={noise}
        onNoise={chooseNoise}
        stream={selfStream}
        background={background}
        onBackground={chooseBackground}
        mirror={mirror}
        onMirror={setMirror}
        captionsOn={captionsOn}
        onCaptions={setCaptionsOn}
      />

      {isHost && (
        <BreakoutModal
          open={breakoutOpen}
          onClose={() => setBreakoutOpen(false)}
          meeting={meeting}
          participants={participants}
          onOpenRooms={async (n, a) => { await openBreakouts(n, a); }}
          onCloseRooms={async () => { await closeBreakouts(meeting); toast("Breakout rooms closed"); setBreakoutOpen(false); }}
          onJoinRoom={async (r) => { await cleanup(); router.push(`/room/${r.id}?quick=1`); }}
        />
      )}
    </div>
  );
}

function Tool({ label, children, onClick, active, warn, green, badge, badgeRed, disabled, caret, onCaret }) {
  return (
    <div className="relative flex shrink-0 items-start">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`relative flex w-[68px] flex-col items-center gap-1 rounded-xl py-1.5 text-[11.5px] font-medium transition disabled:opacity-35 md:w-[76px] ${
          active ? "bg-white/[0.12] text-white" : "text-[#e6e6e8] hover:bg-white/[0.07]"
        }`}
      >
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${green ? "bg-[#1f9d6b] text-white" : ""}`}>{children}</span>
        <span className="truncate">{label}</span>
        {warn && <span className="absolute left-[38px] top-[18px] h-2 w-2 rounded-full bg-[#ff6b6b] ring-2 ring-black" />}
        {badge ? (
          <span className={`absolute right-2.5 top-0.5 min-w-[17px] rounded-full px-1 text-[10px] font-bold leading-[17px] ${badgeRed ? "bg-[#e03131] text-white" : "text-white/80"}`}>{badge}</span>
        ) : null}
      </button>
      {caret && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCaret();
          }}
          className="ml-0.5 mt-1.5 grid h-6 w-5 place-items-center rounded-md text-white/70 hover:bg-white/15 hover:text-white"
          aria-label={`${label} options`}
        >
          <ChevronUp size={14} />
        </button>
      )}
    </div>
  );
}

function fmtRec(ms) {
  const t = Math.max(0, Math.floor((ms || 0) / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return `${h ? h + ":" : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
}
