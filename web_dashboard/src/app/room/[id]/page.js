"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Lock, UserX } from "lucide-react";
import { canJoin, isSuper, isStaff } from "@/lib/permissions";
import SignIn from "@/components/SignIn";
import { useAuth, displayName } from "@/lib/auth";
import { controlsOf, requestLobby, watchLobbyDoc, watchMeeting } from "@/lib/meetings";
import Prejoin from "@/components/room/Prejoin";
import Room from "@/components/room/Room";
import { Logo, Spinner } from "@/components/ui";

function Blocked({ icon: Icon, title, sub }) {
  return (
    <div className="studio grid min-h-screen place-items-center text-center">
      <div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/5"><Icon size={28} /></div>
        <div className="mt-5 font-display text-2xl font-bold">{title}</div>
        <p className="mt-2 text-[var(--s-muted)]">{sub}</p>
        <Link href="/dashboard" className="btn btn-primary mt-6">Go home</Link>
      </div>
    </div>
  );
}

function RoomPage() {
  const { id } = useParams();
  const search = useSearchParams();
  const { user, profile, loading } = useAuth();
  const [meeting, setMeeting] = useState(undefined);
  const [joined, setJoined] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [denied, setDenied] = useState(false);
  const pendingJoin = useRef(null);
  const quickTried = useRef(false);

  useEffect(() => { if (!loading && user && profile?.isActive) return watchMeeting(id, setMeeting); }, [id, loading, user, profile]);

  const isHost = !!user && !!meeting && (meeting.hostUid === user.uid || isSuper(profile));
  const quick = search.get("quick") === "1";

  // Breakout rooms / returning from them join straight away with default devices.
  useEffect(() => {
    if (!quick || quickTried.current || !meeting || loading || joined || !canJoin(profile, meeting)) return;
    if (!user && !meeting.parentId) return;
    quickTried.current = true;
    (async () => {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => new MediaStream());
      }
      const name = user ? displayName(user, profile) : localStorage.getItem("mm-guest-name") || "Guest";
      setJoined({ stream, name, cam: stream.getVideoTracks().length > 0, mic: false });
    })();
  }, [quick, meeting, loading, user, profile, joined]);

  if (!loading && !user) return <SignIn />;
  if (!loading && user && profile?.isActive !== true) return <Blocked icon={UserX} title="Account unavailable" sub="Testing is in progress or your account is disabled." />;
  if (meeting === undefined || loading)
    return (
      <div className="studio grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4"><Logo withName={false} size={44} /><Spinner /></div>
      </div>
    );
  if (meeting === null || !canJoin(profile, meeting)) return <Blocked icon={UserX} title="Meeting access denied" sub="You can join your own team’s meetings. Board meetings are for team leads and administrators." />;

  const controls = controlsOf(meeting);
  const removedKeys = meeting.removed || [];
  if (!isHost && user && removedKeys.includes(user.uid)) return <Blocked icon={UserX} title="You were removed from this meeting" sub="The host removed you, so you can't rejoin." />;

  if (joined)
    return <Room meeting={meeting} localStream={joined.stream} name={joined.name} initialCam={joined.cam} initialMic={joined.mic} user={user} isHost={isHost} shareOnStart={search.get("share") === "1"} />;

  if (controls.locked && !isHost && !isStaff(profile) && !quick) return <Blocked icon={Lock} title="This meeting is locked" sub="The host has locked the meeting. Ask them to unlock it to join." />;
  if (quick) return <div className="studio grid min-h-screen place-items-center"><Spinner /></div>;

  const needsLobby = !isHost && !isStaff(profile) && (!user || controls.waitingRoom);
  const onJoin = async (j) => {
    try {
      localStorage.setItem("mm-guest-name", j.name);
    } catch {}
    if (!needsLobby) return setJoined(j);
    if (!user && removedKeys.includes(j.name)) return setDenied(true);
    pendingJoin.current = j;
    setWaiting(true);
    const ref = await requestLobby(id, j.name, user?.email || "");
    const un = watchLobbyDoc(id, ref.id, (d) => {
      if (d?.status === "admitted") {
        un();
        setJoined(pendingJoin.current);
      } else if (d?.status === "denied") {
        un();
        setWaiting(false);
        setDenied(true);
      }
    });
  };

  return <Prejoin meeting={meeting} defaultName={user ? displayName(user, profile) : ""} isGuest={needsLobby} waiting={waiting} denied={denied} onJoin={onJoin} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="studio min-h-screen" />}>
      <RoomPage />
    </Suspense>
  );
}
