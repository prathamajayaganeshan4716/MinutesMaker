"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import SignIn from "@/components/SignIn";
import { findMeeting } from "@/lib/meetings";
import { Logo, Spinner } from "@/components/ui";

function Join() {
  const search = useSearchParams();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (loading || !user || profile?.isActive !== true) return;
    let code = search.get("code") || search.get("join") || "";
    if (!code && typeof window !== "undefined") code = (window.location.hash.match(/code=([^&]+)/) || [])[1] || "";
    if (!code) return setMissing(true);
    findMeeting(code).then((m) => (m ? router.replace(`/room/${m.id}`) : setMissing(true))).catch(() => setMissing(true));
  }, [search, router, user, profile, loading]);
  if (!loading && !user) return <SignIn />;
  if (!loading && user && profile?.isActive !== true) return <div className="p-8">This account is temporarily unavailable.</div>;
  return (
    <div className="grid min-h-screen place-items-center text-center">
      <div className="flex flex-col items-center gap-4">
        <Logo size={40} />
        {missing ? (
          <>
            <div className="font-semibold text-ink">Meeting unavailable or access denied.</div>
            <Link href="/dashboard" className="btn btn-primary">Go home</Link>
          </>
        ) : (
          <div className="flex items-center gap-2 text-muted"><Spinner size={16} /> Finding your meeting…</div>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Join />
    </Suspense>
  );
}
