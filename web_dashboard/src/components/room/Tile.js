"use client";
import { useEffect, useRef } from "react";
import { Hand, MicOff, MonitorUp, Pin, PinOff, UserRound } from "lucide-react";
import { Avatar } from "../ui";
import { STATUS_ICON } from "./Menus";

/** One participant video. Registers its <video> so the recorder can composite it. */
export default function Tile({ id, stream, name, isLocal, muted, videoOff, sharing, speaking, hand, status, pinned, onPin, register, small, fit = "cover", mirror, hidePictures, blockVideo, sinkId, isHost }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (v && stream && v.srcObject !== stream) v.srcObject = stream;
  }, [stream, videoOff]);
  useEffect(() => {
    register?.(id, ref.current);
    return () => register?.(id, null);
  }, [id, register]);
  useEffect(() => {
    const v = ref.current;
    if (v && !isLocal && sinkId && v.setSinkId) v.setSinkId(sinkId).catch(() => {});
  }, [sinkId, isLocal]);
  const brb = status === "brb";
  const showVideo = stream && (!videoOff || sharing) && !brb && !(blockVideo && !isLocal && !sharing);
  const badge = status && status !== "brb" ? STATUS_ICON[status] : null;

  return (
    <div
      className={`group relative h-full w-full overflow-hidden rounded-xl bg-[#232326] transition-shadow duration-200 ${
        speaking ? "shadow-[0_0_0_2px_#3ddc97]" : "shadow-[0_0_0_1px_var(--s-line)]"
      }`}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={isLocal}
        className={`absolute inset-0 h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"} ${mirror ? "-scale-x-100" : ""} ${showVideo ? "" : "invisible"}`}
      />
      {!showVideo && (
        <div className="absolute inset-0 grid place-items-center bg-[#232326]">
          {brb ? (
            <div className="text-center">
              <div className={small ? "text-2xl" : "text-5xl"}>⏳</div>
              {!small && <div className="mt-2 text-sm font-semibold text-white/80">Be right back</div>}
            </div>
          ) : hidePictures ? (
            <div className={`font-semibold text-white/90 ${small ? "text-sm" : "text-2xl"}`}>{name}</div>
          ) : (
            <div className={speaking ? "rounded-full ring-4 ring-[#3ddc97]/50" : ""}>
              {blockVideo && !isLocal ? <div className="grid h-16 w-16 place-items-center rounded-full bg-white/10"><UserRound size={30} /></div> : <Avatar name={name} size={small ? 44 : 84} />}
            </div>
          )}
        </div>
      )}
      <div className={`absolute bottom-1.5 left-1.5 flex max-w-[88%] items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 font-medium text-white ${small ? "text-[11px]" : "text-[13px]"}`}>
        {muted ? <MicOff size={small ? 11 : 13} className="shrink-0 text-[#ff6b6b]" /> : null}
        {sharing && <MonitorUp size={small ? 11 : 13} className="shrink-0 text-[#63e6be]" />}
        <span className="truncate">{name}{isLocal ? " (You)" : ""}{isHost && !small ? " · Host" : ""}</span>
      </div>
      <div className="absolute left-1.5 top-1.5 flex gap-1">
        {hand && <span className="flex items-center gap-1 rounded-md bg-[#f59f00] px-1.5 py-0.5 text-[11px] font-bold text-black"><Hand size={12} />{!small && " Hand raised"}</span>}
        {badge && <span title={badge.label} className="rounded-md bg-black/60 px-1.5 py-0.5 text-sm">{badge.icon}</span>}
      </div>
      {onPin && !small && (
        <button onClick={onPin} className="absolute right-2 top-2 rounded-lg bg-black/55 p-1.5 text-white opacity-0 transition group-hover:opacity-100" title={pinned ? "Unpin" : "Pin"}>
          {pinned ? <PinOff size={15} /> : <Pin size={15} />}
        </button>
      )}
    </div>
  );
}
