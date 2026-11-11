"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, AudioLines, ChevronLeft, ChevronRight, Disc3, FileText, LayoutGrid, LogIn, Menu, PenLine, ShieldCheck, Sparkles, Users, Video, X,
} from "lucide-react";
import { Logo, ThemeSwitch } from "@/components/ui";
import { JoinDialog } from "@/components/MeetingDialogs";
import { useAuth } from "@/lib/auth";

const SLIDES = [
  { icon: AudioLines, title: "Live Transcript", text: "Every speaker, word for word, a few seconds after they speak.", img: "/img/s-transcript.jpg" },
  { icon: Sparkles, title: "AI Minutes", text: "Summary, decisions and action items the moment you end.", img: "/img/s-minutes.jpg" },
  { icon: Disc3, title: "Recording", text: "Record everyone's video and audio with one click.", img: "/img/s-recording.jpg" },
  { icon: ShieldCheck, title: "Host Controls", text: "Waiting room, lock meeting, mute, rename or remove.", img: "/img/s-host.jpg" },
  { icon: PenLine, title: "Whiteboard", text: "Sketch ideas together on a shared live canvas.", img: "/img/s-whiteboard.jpg" },
  { icon: LayoutGrid, title: "Breakout Rooms", text: "Split into small groups — each with its own minutes.", img: "/img/s-breakout.jpg" },
];

const FEATURES = [
  [AudioLines, "Transcript-first", "Speech becomes searchable text with names and timestamps, in English, Tamil, Hindi and more."],
  [FileText, "Minutes you can share", "Summary, decisions, action-item checklist and conclusion — export as PDF or text."],
  [Video, "HD video meetings", "Speaker, gallery and multi-speaker views, screen sharing, reactions and backgrounds."],
  [Users, "Built for boards & teams", "Invite members or guests, admit from the waiting room, and keep every meeting on record."],
];

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("revealed"), io.unobserve(e.target))),
      { threshold: 0.15 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function Landing() {
  const { user } = useAuth();
  const router = useRouter();
  const [join, setJoin] = useState(false);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useReveal();

  useEffect(() => {
    const m = window.location.hash.match(/code=([A-Za-z0-9_-]+)/); // old app invite links
    if (m) router.replace(`/join?code=${m[1]}`);
    const on = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", on);
    return () => window.removeEventListener("scroll", on);
  }, [router]);

  const cta = user ? "Open dashboard" : "Sign in";
  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <header className={`fixed inset-x-0 top-0 z-40 transition ${scrolled ? "border-b border-line bg-surface/90 backdrop-blur" : "bg-transparent"}`}>
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-5">
          <Link href="/"><Logo onDark={!scrolled} /></Link>
          <nav className={`hidden items-center gap-6 text-sm font-medium md:flex ${scrolled ? "text-ink-2" : "text-white/85"}`}>
            <a href="#features" className="hover:opacity-70">Features</a>
            <a href="#how" className="hover:opacity-70">How it works</a>
            <a href="#about" className="hover:opacity-70">About</a>
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <button onClick={() => setJoin(true)} className={`btn h-9 ${scrolled ? "text-ink hover:bg-surface-2" : "text-white hover:bg-white/10"}`}>Join a meeting</button>
            <Link href="/dashboard" className={`btn h-9 ${scrolled ? "btn-primary" : "bg-white text-[#6a0c13] hover:bg-white/90"}`}>{cta}</Link>
          </div>
          <button className={`ml-auto rounded-lg p-2 md:hidden ${scrolled ? "text-ink" : "text-white"}`} onClick={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</button>
        </div>
        {menu && (
          <div className="border-t border-line bg-surface px-5 py-4 md:hidden">
            {["features", "how", "about"].map((a) => <a key={a} href={`#${a}`} onClick={() => setMenu(false)} className="block py-2 font-medium capitalize text-ink">{a === "how" ? "How it works" : a}</a>)}
            <div className="mt-3 flex gap-2">
              <button onClick={() => setJoin(true)} className="btn btn-ghost flex-1">Join</button>
              <Link href="/dashboard" className="btn btn-primary flex-1">{cta}</Link>
            </div>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-[radial-gradient(120%_100%_at_50%_0%,#a3222b_0%,#6a0c13_45%,#2a0507_100%)] pb-16 pt-32 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-60">
          <div className="absolute left-[8%] top-24 h-72 w-72 animate-[float_12s_ease-in-out_infinite] rounded-full bg-[#e0656b]/25 blur-3xl" />
          <div className="absolute right-[6%] top-40 h-96 w-96 animate-[float_16s_ease-in-out_infinite_reverse] rounded-full bg-[#ffb4b8]/15 blur-3xl" />
        </div>
        <span className="brand-mark pointer-events-none absolute -right-24 top-10 hidden h-[460px] w-[460px] text-white opacity-[0.05] lg:block" />
        <div className="relative mx-auto max-w-[920px] px-5 text-center">
          <div data-reveal className="reveal inline-flex items-center gap-2 rounded-full bg-white/12 px-3.5 py-1.5 text-xs font-semibold backdrop-blur">
            <Sparkles size={14} /> Smart Meeting Collaboration &amp; Minutes
          </div>
          <h1 data-reveal className="reveal mt-6 font-display text-[40px] font-extrabold leading-[1.05] tracking-tight md:text-[62px]" style={{ transitionDelay: "80ms" }}>
            Meet face to face.
            <br />
            <span className="bg-gradient-to-r from-[#ffd6d8] to-[#f59aa0] bg-clip-text text-transparent">Every word, written down.</span>
          </h1>
          <p data-reveal className="reveal mx-auto mt-5 max-w-[640px] text-[17px] leading-relaxed text-white/75" style={{ transitionDelay: "160ms" }}>
            Minutes Maker turns every video meeting into a live transcript, a recording and clear minutes — so your team can talk freely and act on what was decided.
          </p>
          <div data-reveal className="reveal mt-8 flex flex-wrap justify-center gap-3" style={{ transitionDelay: "240ms" }}>
            <Link href="/dashboard" className="btn h-12 bg-white px-6 text-[15px] text-[#6a0c13] hover:bg-white/90"><Video size={18} /> {user ? "Start a meeting" : "Get started free"}</Link>
            <button onClick={() => setJoin(true)} className="btn h-12 border border-white/25 bg-white/10 px-6 text-[15px] text-white hover:bg-white/15"><LogIn size={18} /> Join with a code</button>
          </div>
        </div>
        <Carousel />
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-[1200px] px-5 py-20">
        <div data-reveal className="reveal mx-auto max-w-2xl text-center">
          <div className="text-sm font-bold uppercase tracking-[0.18em] text-brand">Features</div>
          <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">Everything a meeting needs — and the minutes after it</h2>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(([Icon, t, d], i) => (
            <div key={t} data-reveal className="reveal card p-6" style={{ transitionDelay: `${i * 90}ms` }}>
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand"><Icon size={21} /></div>
              <h3 className="mt-4 font-display text-lg font-bold text-ink">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-surface py-20">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 lg:grid-cols-2">
          <div data-reveal className="reveal relative overflow-hidden rounded-[28px] shadow-pop">
            <img src="/img/how.jpg" alt="A team in a meeting" className="aspect-[4/3] w-full object-cover" />
            <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-black/60 p-4 text-white backdrop-blur-md">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#8ce99a]"><span className="h-2 w-2 rounded-full bg-[#8ce99a] live-dot" style={{ color: "#8ce99a" }} /> LIVE TRANSCRIPT</div>
              <p className="mt-2 text-sm"><b className="text-[#ffc9cc]">Priya:</b> Let&apos;s lock the launch for Friday.</p>
              <p className="mt-1 text-sm"><b className="text-[#a5d8ff]">Ravi:</b> Agreed — I&apos;ll prepare the release notes.</p>
            </div>
          </div>
          <div>
            <div data-reveal className="reveal text-sm font-bold uppercase tracking-[0.18em] text-brand">How it works</div>
            <h2 data-reveal className="reveal mt-3 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">From conversation to minutes in three steps</h2>
            <div className="mt-8 space-y-5">
              {[
                ["1", "Start or join", "Create an instant meeting or join with a code — guests wait for the host to admit them."],
                ["2", "Talk naturally", "Each person's speech is transcribed live with their name. Record when you need to."],
                ["3", "Get the minutes", "End the meeting and the summary, decisions and action items are ready to share."],
              ].map(([n, t, d], i) => (
                <div key={n} data-reveal className="reveal flex gap-4" style={{ transitionDelay: `${i * 110}ms` }}>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand font-display font-bold text-white">{n}</div>
                  <div>
                    <div className="font-semibold text-ink">{t}</div>
                    <div className="mt-1 text-sm leading-relaxed text-muted">{d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="mx-auto max-w-[1200px] px-5 py-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <div data-reveal className="reveal text-sm font-bold uppercase tracking-[0.18em] text-brand">About Minutes Maker</div>
            <h2 data-reveal className="reveal mt-3 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">Built so nobody has to take notes again</h2>
            <p data-reveal className="reveal mt-5 leading-relaxed text-muted">
              Minutes Maker started as a tool for boards and committees that needed an accurate record of every meeting. Today it brings HD video, live transcription, recording and AI-written minutes together in one place — on the web and on Android.
            </p>
            <div data-reveal className="reveal mt-8 grid grid-cols-3 gap-4">
              {[["Live", "transcript"], ["1-click", "recording"], ["Auto", "minutes"]].map(([a, b]) => (
                <div key={b} className="card p-4 text-center">
                  <div className="font-display text-2xl font-extrabold text-brand">{a}</div>
                  <div className="text-xs text-muted">{b}</div>
                </div>
              ))}
            </div>
          </div>
          <div data-reveal className="reveal grid grid-cols-2 gap-4">
            <img src="/img/about-1.jpg" alt="" className="aspect-[3/4] w-full rounded-[22px] object-cover shadow-card" />
            <img src="/img/about-2.jpg" alt="" className="mt-10 aspect-[3/4] w-full rounded-[22px] object-cover shadow-card" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-[1200px] px-5 pb-20">
        <div data-reveal className="reveal relative overflow-hidden rounded-[28px] bg-[radial-gradient(120%_120%_at_0%_0%,#9b1c25,#4a070c)] px-8 py-14 text-center text-white">
          <h2 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Your next meeting writes its own minutes</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/75">Start now — it takes a few seconds.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className="btn h-12 bg-white px-6 text-[#6a0c13] hover:bg-white/90">{cta} <ArrowRight size={17} /></Link>
            <button onClick={() => setJoin(true)} className="btn h-12 border border-white/25 bg-white/10 px-6 text-white hover:bg-white/15">Join a meeting</button>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-5 py-8">
          <Logo size={28} />
          <span className="text-sm text-muted">© {new Date().getFullYear()} Minutes Maker · Smart Meeting Collaboration &amp; Minutes</span>
          <div className="ml-auto"><ThemeSwitch compact /></div>
        </div>
      </footer>

      <JoinDialog open={join} onClose={() => setJoin(false)} />
    </div>
  );
}

/** Auto-sliding feature cards (pauses on hover, arrows to navigate). */
function Carousel() {
  const track = useRef(null);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = SLIDES.length;
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 3200);
    return () => clearInterval(t);
  }, [paused, n]);
  useEffect(() => {
    const el = track.current;
    const card = el?.children[i];
    if (el && card) el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.clientWidth) / 2, behavior: "smooth" });
  }, [i]);
  return (
    <div className="relative mt-14" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div ref={track} className="no-scrollbar flex snap-x gap-5 overflow-x-auto px-[8vw] pb-4" style={{ scrollbarWidth: "none" }}>
        {SLIDES.map((s, k) => (
          <div
            key={s.title}
            onClick={() => setI(k)}
            className={`relative h-[330px] w-[280px] shrink-0 cursor-pointer snap-center overflow-hidden rounded-[24px] bg-[#3a0609] shadow-2xl transition duration-500 md:h-[360px] md:w-[300px] ${k === i ? "scale-100 opacity-100" : "scale-[0.94] opacity-70"}`}
          >
            <img src={s.img} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1d0304] via-[#1d0304]/40 to-transparent" />
            <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold backdrop-blur">
              <s.icon size={16} /> {s.title}
            </div>
            <p className="absolute inset-x-5 bottom-5 text-[15px] font-medium leading-snug">{s.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button onClick={() => setI((i - 1 + n) % n)} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Previous"><ChevronLeft size={18} /></button>
        {SLIDES.map((_, k) => (
          <button key={k} onClick={() => setI(k)} className={`h-2 rounded-full transition-all ${k === i ? "w-7 bg-white" : "w-2 bg-white/40"}`} aria-label={`Slide ${k + 1}`} />
        ))}
        <button onClick={() => setI((i + 1) % n)} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Next"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}
