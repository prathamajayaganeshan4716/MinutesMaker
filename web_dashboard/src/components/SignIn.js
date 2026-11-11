"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, AudioLines, FileText, LogIn, ShieldCheck, Sparkles } from "lucide-react";
import { Logo, Spinner, ThemeSwitch } from "./ui";
import { JoinDialog } from "./MeetingDialogs";
import { useToast } from "./Providers";
import { registerWithEmail, signInWithEmail, signInWithGoogle } from "@/lib/auth";

const DEMO = [
  ["Priya", "Let's lock the launch for Friday and keep the beta list small.", "#6c8cff"],
  ["Ravi", "Agreed. I'll prepare the release notes by Thursday evening.", "#22c3a0"],
  ["Alex", "I'll handle QA on the payment flow before the freeze.", "#f472b6"],
];

export default function SignIn() {
  const toast = useToast();
  const router = useRouter();
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [join, setJoin] = useState(false);

  const google = async () => {
    setBusy("google");
    try {
      await signInWithGoogle();
    } catch (e) {
      toast(e.message?.replace("Firebase: ", "") || "Google sign-in failed", "error");
    }
    setBusy("");
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy("email");
    try {
      if (mode === "signin") await signInWithEmail(email, password);
      else await registerWithEmail(name, email, password);
    } catch (err) {
      toast(err.message?.replace("Firebase: ", "") || "Sign-in failed", "error");
    }
    setBusy("");
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Story panel */}
      <div className="relative hidden overflow-hidden bg-[radial-gradient(120%_90%_at_10%_0%,#8e1820_0%,#5a0a10_45%,#2a0507_100%)] p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -left-32 -top-32 h-[520px] w-[520px] rounded-full bg-[#c2353d] opacity-25 blur-[120px]" />
        <div className="absolute -bottom-40 right-0 h-[480px] w-[480px] rounded-full bg-[#e0656b] opacity-20 blur-[120px]" />
        <div className="relative">
          <Logo onDark size={40} sub />
        </div>
        <div className="relative mt-auto max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur">
            <Sparkles size={14} /> Transcript-first video meetings
          </span>
          <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.05] tracking-tight">
            Meet face to face.
            <br />
            <span className="bg-gradient-to-r from-[#ffc9cc] to-[#f3a1a7] bg-clip-text text-transparent">Every word, captured.</span>
          </h1>
          <p className="mt-4 text-lg text-white/75">HD video calls with a live transcript, one-click recording and minutes — decisions and action items written for you.</p>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-md">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-white/70">
              <span className="h-2 w-2 rounded-full bg-[#3ddc97] live-dot" style={{ color: "#3ddc97" }} /> LIVE TRANSCRIPT
            </div>
            <div className="space-y-3">
              {DEMO.map(([n, t, c], i) => (
                <div key={n} className="flex gap-3 animate-fade-in" style={{ animationDelay: `${i * 0.25}s` }}>
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: c }}>
                    {n.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: c }}>{n}</div>
                    <div className="text-sm text-white/85">{t}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-8 flex gap-6 text-sm text-white/60">
            <span className="flex items-center gap-2"><AudioLines size={16} /> Live captions</span>
            <span className="flex items-center gap-2"><FileText size={16} /> Auto minutes</span>
            <span className="flex items-center gap-2"><ShieldCheck size={16} /> Private by default</span>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="relative flex flex-col bg-bg p-6 sm:p-10">
        <div className="flex items-center justify-between">
          <div className="lg:invisible"><Logo /></div>
          <ThemeSwitch compact />
        </div>
        <div className="m-auto w-full max-w-[400px] py-10">
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-ink">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-2 text-muted">{mode === "signin" ? "Sign in to start or join meetings." : "It takes less than a minute."}</p>

          <button onClick={google} disabled={!!busy} className="btn btn-ghost mt-8 h-12 w-full text-[15px]">
            {busy === "google" ? <Spinner /> : (
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            )}
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted">
            <div className="h-px flex-1 bg-line" /> or with email <div className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && <input className="input h-12" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />}
            <input className="input h-12" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <input className="input h-12" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            <button className="btn btn-primary h-12 w-full text-[15px]" disabled={!!busy}>
              {busy === "email" ? <Spinner /> : null} {mode === "signin" ? "Sign in" : "Create account"} <ArrowRight size={17} />
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-muted">
            {mode === "signin" ? "New to Minutes Maker? " : "Already have an account? "}
            <button className="font-semibold text-brand hover:underline" onClick={() => setMode(mode === "signin" ? "register" : "signin")}>
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>

          <div className="mt-10 rounded-2xl border border-dashed border-line p-4 text-center">
            <p className="text-sm text-muted">Invited to a meeting?</p>
            <button className="btn btn-ghost mt-2" onClick={() => setJoin(true)}>
              <LogIn size={16} /> Join as a guest
            </button>
          </div>
        </div>
      </div>
      <JoinDialog open={join} onClose={() => setJoin(false)} />
    </div>
  );
}
