"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

export function CrmEntryTracker() {
  const pathname = usePathname();

  React.useEffect(() => {
    let cancelled = false;
    const track = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const sessionKey = `crm-entry-tracked:${user.id}`;
      if (typeof window !== "undefined" && sessionStorage.getItem(sessionKey)) return;

      try {
        await supabase.from("user_audit_events").insert({
          user_id: user.id,
          event_type: "crm_entry",
          metadata: {
            source: "dashboard_layout",
            path: pathname,
            user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          },
        });
        if (typeof window !== "undefined") {
          sessionStorage.setItem(sessionKey, "1");
        }
      } catch {
        // Keep tracking best-effort; never interrupt UX.
      }
    };

    void track();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
