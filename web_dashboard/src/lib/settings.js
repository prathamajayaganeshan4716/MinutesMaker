"use client";

export const DEFAULT_SETTINGS = {
  // General
  timeFormat: "12h",
  // Meeting
  muteOnJoin: false,
  videoOffOnJoin: false,
  showTimer: true,
  defaultWaitingRoom: false,
  confirmLeave: true,
  // Recording
  autoDownloadRecording: false,
  // Transcript & AI
  language: "",
  captions: true,
  autoMinutes: true,
  defaultAiSummary: true,
  // Audio & video
  mirrorVideo: true,
  noiseSuppression: true,
  // Whiteboard
  whiteboardHostOnly: false,
};

export function getSettings() {
  try {
    const s = JSON.parse(localStorage.getItem("mm-settings") || "{}");
    // migrate older single keys
    if (s.language === undefined && localStorage.getItem("mm-lang") !== null) s.language = localStorage.getItem("mm-lang");
    if (s.captions === undefined && localStorage.getItem("mm-captions")) s.captions = localStorage.getItem("mm-captions") !== "off";
    return { ...DEFAULT_SETTINGS, ...s };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  try {
    localStorage.setItem("mm-settings", JSON.stringify(next));
    localStorage.setItem("mm-lang", next.language || "");
    localStorage.setItem("mm-captions", next.captions ? "on" : "off");
  } catch {}
  return next;
}
