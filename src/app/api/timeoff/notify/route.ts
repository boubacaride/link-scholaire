import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Sends the approval email for a time-off request.
 *
 * Called by the admin approval dashboard right after it flips a request to
 * `approved` (the DB update itself is done client-side under RLS). This
 * route re-reads the request through the caller's own session — so the
 * same admin RLS that allowed the update governs what we can read here —
 * and emails the address on file for the subject (falling back to the
 * requester).
 *
 * Email delivery uses Resend if RESEND_API_KEY is configured. With no key
 * set the route is a no-op that reports { sent: false } so the UI can tell
 * the admin the approval succeeded but email isn't wired up yet. This
 * keeps the feature fully functional without a provider and "just works"
 * once a key is added — no code change required.
 */
export async function POST(req: Request) {
  let requestId: string | undefined;
  try {
    ({ requestId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  // RLS: only a same-school admin (or the requester/subject) can read this.
  const { data: reqRowRaw, error } = await supabase
    .from("time_off_requests")
    .select(
      "id, start_date, end_date, reason, status, requester_kind, " +
      "subject:profiles!subject_id(first_name,last_name,email), " +
      "requester:profiles!requester_id(first_name,last_name,email)"
    )
    .eq("id", requestId)
    .single();
  const reqRow = reqRowRaw as any;

  if (error || !reqRow) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (reqRow.status !== "approved") {
    return NextResponse.json({ error: "Request is not approved" }, { status: 409 });
  }

  const subject: any = Array.isArray(reqRow.subject) ? reqRow.subject[0] : reqRow.subject;
  const requester: any = Array.isArray(reqRow.requester) ? reqRow.requester[0] : reqRow.requester;
  const to: string | undefined = subject?.email || requester?.email;
  const name = subject ? `${subject.first_name} ${subject.last_name}` : "";

  if (!to) {
    return NextResponse.json({ sent: false, reason: "no-address-on-file" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.TIMEOFF_FROM_EMAIL || "Link Scholaire <onboarding@resend.dev>";
  const range = reqRow.start_date === reqRow.end_date
    ? reqRow.start_date
    : `${reqRow.start_date} → ${reqRow.end_date}`;

  const subjectLine = "Your time-off request has been approved";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#3a6d9a">Time-off approved ✅</h2>
      <p>Hello ${name || "there"},</p>
      <p>Your time-off request has been <strong style="color:#10b981">approved</strong>.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Dates</td><td style="padding:4px 0"><strong>${range}</strong></td></tr>
        ${reqRow.reason ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">Reason</td><td style="padding:4px 0">${reqRow.reason}</td></tr>` : ""}
      </table>
      <p style="color:#6b7280;font-size:13px">This is an automated message from Link Scholaire.</p>
    </div>`;

  if (!apiKey) {
    // No provider configured — approval still stands; report not-sent.
    return NextResponse.json({ sent: false, reason: "no-provider" });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to, subject: subjectLine, html }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ sent: false, reason: "provider-error", detail }, { status: 502 });
    }
    return NextResponse.json({ sent: true });
  } catch (e: any) {
    return NextResponse.json({ sent: false, reason: "provider-exception", detail: e?.message }, { status: 502 });
  }
}
