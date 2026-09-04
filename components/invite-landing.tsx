"use client";

import { CalendarCheck, ChevronRight, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export function InviteLanding({ code }: { code: string }) {
  const [status, setStatus] = useState<"loading" | "joined" | "signin" | "invalid" | "demo">("loading");

  useEffect(() => {
    void Promise.resolve().then(async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setStatus("demo");
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.localStorage.setItem("owlmeet-pending-invite", code);
        setStatus("signin");
        return;
      }
      const { error } = await supabase.rpc("join_private_event", { code });
      setStatus(error ? "invalid" : "joined");
    });
  }, [code]);

  return (
    <main className="center-page invite-page">
      <section className="center-card invite-card">
        <span className="mail-illustration"><CalendarCheck size={32} /></span>
        <span className="eyebrow"><LockKeyhole size={13} /> Private OwlMeet invitation</span>
        {status === "loading" && <><h1>Opening your invite…</h1><p>Checking this private event invitation.</p></>}
        {status === "joined" && <><h1>You’re invited</h1><p>The event has been added to OwlMeet. You can review it before accepting.</p><Link className="primary wide" href="/">Open my events <ChevronRight size={18} /></Link></>}
        {status === "signin" && <><h1>Sign in to continue</h1><p>Only verified Rice students can view private event details.</p><Link className="primary wide" href="/">Continue with Rice email <ChevronRight size={18} /></Link></>}
        {status === "invalid" && <><h1>This invite isn’t available</h1><p>The link may be incorrect, expired, or the event may have been removed.</p><Link className="secondary wide" href="/">Go to OwlMeet</Link></>}
        {status === "demo" && <><h1>You found a private invite</h1><p>In demo mode, invitation links open the sample OwlMeet experience.</p><Link className="primary wide" href="/">Open OwlMeet <ChevronRight size={18} /></Link></>}
        {status !== "loading" && status !== "invalid" && <a className="secondary wide invite-native" href={`owlmeet://invite/${code}`}>Open in the mobile app</a>}
      </section>
    </main>
  );
}
