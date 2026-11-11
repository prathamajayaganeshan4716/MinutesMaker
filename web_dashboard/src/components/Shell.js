"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarPlus,
  Disc3,
  FileText,
  House,
  LogIn,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShieldOff,
  Users,
  Video,
} from "lucide-react";
import { Avatar, Logo, Spinner, ThemeSwitch } from "./ui";
import { JoinDialog, NewMeetingDialog } from "./MeetingDialogs";
import SignIn from "./SignIn";
import { canCreate, isBoard, isStaff, roleLabel } from "@/lib/permissions";
import { displayName, isAdmin, signOut, useAuth } from "@/lib/auth";
import { recoverRecordings } from "@/lib/recorder";

const STAFF_NAV = [
  ["/dashboard", "Home", House],
  ["/meetings", "Meetings", CalendarDays],
  ["/minutes", "Minutes", FileText],
  ["/members", "Members", Users],
  ["/recordings", "Recordings", Disc3],
];

export const SearchContext = { value: "" };

export default function Shell({ children }) {
  const { user, profile, loading, accessError } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const restricted = !isStaff(profile);
  const [dialog, setDialog] = useState(null);
  const [menu, setMenu] = useState(false);
  const [newMenu, setNewMenu] = useState(false);
  const searchRef = useRef(null);
  const [q, setQ] = useState("");

  // Finish any recording that was interrupted by a closed tab or crash
  useEffect(() => {
    recoverRecordings().catch(() => {});
  }, []);

  // Old mobile-app invite links look like /#/join?code=cnt-1234-5678
  useEffect(() => {
    const m = window.location.hash.match(/code=([A-Za-z0-9_-]+)/);
    if (m) router.replace(`/join?code=${m[1]}`);
  }, [router]);

  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  useEffect(() => {
    const open = (e) => setDialog(e.detail);
    window.addEventListener("mm:dialog", open);
    return () => window.removeEventListener("mm:dialog", open);
  }, []);

  useEffect(() => {
    const allowed = ["/dashboard", "/meetings", "/join", "/settings"];
    if (restricted && !allowed.includes(pathname) && !pathname.startsWith("/room/")) router.replace("/dashboard");
  }, [restricted, pathname, router]);

  if (loading)
    return (
      <div className="grid min-h-screen place-items-center text-muted">
        <div className="flex flex-col items-center gap-4">
          <Logo size={44} withName={false} />
          <Spinner />
        </div>
      </div>
    );
  if (!user) return <SignIn />;

  if (accessError || profile?.isActive !== true)
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">
            <ShieldOff size={26} />
          </div>
          <div className="mt-4 font-display text-xl font-bold text-ink">
            Your account is disabled
          </div>
          <p className="mt-1 text-sm text-muted">
            {accessError || "An administrator has temporarily disabled this account."}
          </p>
          <button className="btn btn-ghost mt-5" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );

  const admin = isAdmin(user, profile);
  const nav = restricted
    ? [
        ["/dashboard", "Home", House],
        ["/meetings", "Meetings", CalendarDays],
        ["/join", "Join Meeting", LogIn],
        ["/settings#profile", "Profile", Users],
      ]
    : [...STAFF_NAV.filter(([href]) => !["/minutes", "/recordings"].includes(href) || isBoard(profile)), ...(admin ? [["/admin", "Admin", ShieldCheck]] : [])];
  const mobileNav = restricted ? [...nav, ["/settings", "Settings", Settings]] : nav;
  const name = displayName(user, profile);
  const active = (href) => pathname.startsWith(href.split("#")[0]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Icon rail */}
      <aside className="hidden w-[92px] shrink-0 flex-col items-center border-r border-line bg-surface py-5 md:flex">
        <Link href="/" className="mb-6" title="Minutes Maker home">
          <Logo withName={false} size={38} />
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-1.5">
          {nav.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={`group flex w-[72px] flex-col items-center gap-1 rounded-2xl py-2.5 text-[11.5px] font-semibold transition ${
                active(href)
                  ? "bg-brand-soft text-brand"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Icon size={22} strokeWidth={active(href) ? 2.3 : 1.9} />
              {label}
            </Link>
          ))}
        </nav>
        <Link
          href="/settings"
          className={`flex w-[72px] flex-col items-center gap-1 rounded-2xl py-2.5 text-[11.5px] font-semibold ${
            active("/settings")
              ? "bg-brand-soft text-brand"
              : "text-muted hover:bg-surface-2 hover:text-ink"
          }`}
        >
          <Settings size={22} /> Settings
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-[68px] shrink-0 items-center gap-4 border-b border-line bg-surface px-4 md:px-7">
          <div className="md:hidden">
            <Logo withName={false} size={32} />
          </div>
          <div className="hidden font-display text-[15px] font-extrabold tracking-[0.08em] text-ink lg:block">
            MINUTES <span className="text-brand">MAKER</span>
          </div>
          {!restricted && <div className="relative w-full max-w-md lg:ml-6">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                window.dispatchEvent(new CustomEvent("mm:search", { detail: e.target.value }));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && pathname === "/dashboard") router.push("/minutes");
              }}
              className="input h-10 pl-10 pr-16"
              placeholder="Search meetings & minutes"
            />
            <kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:block">
              Ctrl K
            </kbd>
          </div>}
          <div className="relative ml-auto flex shrink-0 items-center gap-2">
            {!restricted && <div className="relative">
              <button
                onClick={() => setNewMenu((v) => !v)}
                className="btn btn-ghost h-10 w-10 !p-0"
                title="New"
              >
                <Plus size={19} />
              </button>
              {newMenu && (
                <Popover onClose={() => setNewMenu(false)} className="right-0 w-56">
                  <MenuItem
                    icon={Video}
                    onClick={() => {
                      setNewMenu(false);
                      if (canCreate(profile)) setDialog("new");
                    }}
                  >
                    New meeting
                  </MenuItem>
                  <MenuItem
                    icon={LogIn}
                    onClick={() => {
                      setNewMenu(false);
                      setDialog("join");
                    }}
                  >
                    Join meeting
                  </MenuItem>
                  <MenuItem
                    icon={CalendarPlus}
                    onClick={() => {
                      setNewMenu(false);
                      if (canCreate(profile)) setDialog("schedule");
                    }}
                  >
                    Schedule meeting
                  </MenuItem>
                </Popover>
              )}
            </div>}
            <div className="hidden lg:block">
              <ThemeSwitch compact />
            </div>
            <button
              onClick={() => setMenu((v) => !v)}
              className="relative rounded-full"
              title={name}
            >
              <Avatar name={name} size={38} />
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-live" />
            </button>
            {menu && (
              <Popover onClose={() => setMenu(false)} className="right-0 top-12 w-72">
                <div className="flex items-center gap-3 p-3">
                  <Avatar name={name} size={42} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink">{name}</div>
                    <div className="truncate text-xs text-muted">{user.email}</div>
                    <div className="mt-1 text-[11px] font-semibold text-brand">
                      {roleLabel(profile)}
                    </div>
                  </div>
                </div>
                <div className="px-3 pb-3">
                  <ThemeSwitch />
                </div>
                {admin ? (
                  <>
                    <div className="border-t border-line px-3 py-2.5">
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
                        Settings
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {[
                          ["ai", "Minutes AI"],
                          ["general", "General"],
                          ["meeting", "Meeting"],
                          ["recording", "Recording"],
                          ["transcript", "Transcript"],
                          ["av", "Audio & Video"],
                          ["notes", "My Notes"],
                          ["profile", "Profile"],
                        ].map(([k, l]) => (
                          <button
                            key={k}
                            onClick={() => {
                              setMenu(false);
                              router.push(`/settings#${k}`);
                            }}
                            className="rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink"
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-line p-1.5">
                      <MenuItem
                        icon={ShieldCheck}
                        onClick={() => {
                          setMenu(false);
                          router.push("/admin");
                        }}
                      >
                        Admin panel
                      </MenuItem>
                      <MenuItem
                        icon={Settings}
                        onClick={() => {
                          setMenu(false);
                          router.push("/settings");
                        }}
                      >
                        Settings
                      </MenuItem>
                      <MenuItem icon={LogOut} danger onClick={() => signOut()}>
                        Sign out
                      </MenuItem>
                    </div>
                  </>
                ) : (
                  <div className="border-t border-line p-1.5">
                    <MenuItem
                      icon={Settings}
                      onClick={() => {
                        setMenu(false);
                        router.push("/settings");
                      }}
                    >
                      Settings
                    </MenuItem>
                    <MenuItem icon={LogOut} danger onClick={() => signOut()}>
                      Sign out
                    </MenuItem>
                  </div>
                )}
              </Popover>
            )}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>

        {/* Mobile tab bar */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface md:hidden">
          {mobileNav.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${
                active(href) ? "text-brand" : "text-muted"
              }`}
            >
              <Icon size={21} /> {label}
            </Link>
          ))}
        </nav>
      </div>

      <NewMeetingDialog open={dialog === "new"} onClose={() => setDialog(null)} />
      <NewMeetingDialog
        open={dialog === "schedule"}
        schedule
        onClose={() => setDialog(null)}
      />
      <JoinDialog open={dialog === "join"} onClose={() => setDialog(null)} />
    </div>
  );
}

export function openDialog(name) {
  window.dispatchEvent(new CustomEvent("mm:dialog", { detail: name }));
}

export function useSearch() {
  const [q, setQ] = useState("");
  useEffect(() => {
    const on = (e) => setQ(e.detail || "");
    window.addEventListener("mm:search", on);
    return () => window.removeEventListener("mm:search", on);
  }, []);
  return q.trim().toLowerCase();
}

function Popover({ children, onClose, className = "" }) {
  useEffect(() => {
    const c = () => onClose();
    const t = setTimeout(() => window.addEventListener("click", c), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("click", c);
    };
  }, [onClose]);
  return (
    <div
      className={`card animate-fade-in absolute top-12 z-40 p-1.5 shadow-pop ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function MenuItem({ icon: Icon, children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-surface-2 ${
        danger ? "text-rec" : "text-ink"
      }`}
    >
      <Icon size={17} /> {children}
    </button>
  );
}
