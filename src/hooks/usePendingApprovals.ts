"use client";

// Live count of pending time-off requests for the admin sidebar badges.
// Polls every 30s plus listens for INSERT/UPDATE/DELETE on the
// time_off_requests table so a new submission lights up the badge
// without waiting for the next poll tick.
//
// RLS on time_off_requests (migration 024) lets school admins SELECT
// all rows for their school, so a head:true count comes back with the
// correct number for the current admin.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface PendingCounts {
  staff: number;
  student: number;
  total: number;
}

const ZERO: PendingCounts = { staff: 0, student: 0, total: 0 };

export const usePendingApprovals = (): PendingCounts => {
  const { user } = useAuth();
  const supabase = createClient();
  const [counts, setCounts] = useState<PendingCounts>(ZERO);

  const isAdmin = user?.role === "school_admin" || user?.role === "platform_admin";
  const schoolId = user?.schoolId;

  const refresh = useCallback(async () => {
    if (!supabase || !isAdmin || !schoolId) {
      setCounts(ZERO);
      return;
    }
    const [staffRes, studentRes] = await Promise.all([
      supabase
        .from("time_off_requests")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("requester_kind", "staff")
        .eq("status", "pending"),
      supabase
        .from("time_off_requests")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("requester_kind", "student")
        .eq("status", "pending"),
    ]);
    const staff = staffRes.count ?? 0;
    const student = studentRes.count ?? 0;
    setCounts({ staff, student, total: staff + student });
  }, [supabase, isAdmin, schoolId]);

  useEffect(() => {
    if (!isAdmin || !schoolId) return;
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh, isAdmin, schoolId]);

  // Realtime: any change to a row in this school's time-off table
  // re-fetches the counts. The Supabase realtime channel is scoped to
  // `school_id=eq.<id>` so other schools don't trigger noise.
  useEffect(() => {
    if (!supabase || !isAdmin || !schoolId) return;
    const channel = supabase
      .channel(`time-off-admin-${schoolId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "time_off_requests",
          filter: `school_id=eq.${schoolId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, isAdmin, schoolId, refresh]);

  return counts;
};
