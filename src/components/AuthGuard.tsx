"use client";

// Client-side auth gate for the dashboard. The dashboard layout has no
// server guard, so without this a logged-out visitor lands on any dashboard
// page as "Guest" — RLS hides all data and role-gated UI (e.g. the platform
// admin's "Onboard School" button) never renders, which looks broken. Once
// auth has resolved, send anyone without a session to the sign-in page.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/sign-in${next}`);
    }
  }, [loading, user, pathname, router]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-gray-200 border-t-blue-600 animate-spin" />
      </div>
    );
  }

  // Redirecting — render nothing rather than the empty "Guest" dashboard.
  if (!user) return null;

  return <>{children}</>;
}
