// Approval-triggered class-notification engine for teacher time-off.
//
// Lifecycle:
//   1. Teacher submits a time-off request — STATUS = 'pending'.
//      Nothing is sent.
//   2. Administrator clicks "Approve" on the request — the dashboard
//      flips STATUS = 'approved' under RLS, then POSTs to this route.
//   3. This route:
//        a) re-reads the request through the caller's session
//           (admin RLS allows it),
//        b) verifies the row is actually approved (not just claimed),
//        c) verifies notifications_sent_at IS NULL (idempotent — a
//           re-click is a no-op),
//        d) loads every lesson taught by the teacher subject of the
//           request,
//        e) computes the overlapping sessions inside the window via
//           the pure scheduleOverlap module,
//        f) for each session, loads enrolled students + linked
//           parents and builds a privacy-preserving notification
//           message (the absence Type is NEVER mentioned),
//        g) bulk-inserts notification rows,
//        h) marks notifications_sent_at on the request row.
//
// Failures here MUST NOT roll back the approval. The dashboard
// awaits this call but treats errors as a soft warning.

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  lessonsAffectedByTimeOff,
  buildNotificationContent,
  type LessonRow,
  type AffectedSession,
} from "@/lib/timeOff/scheduleOverlap";

interface ReqRow {
  id: string;
  school_id: string;
  subject_id: string;
  start_date: string;
  end_date: string;
  status: string;
  notifications_sent_at: string | null;
  subject: { id: string; first_name: string; last_name: string; role: string } | null;
}

interface LessonResponseRow {
  id: string;
  class_id: string;
  subject_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject: { name: string } | null;
}

export async function POST(req: Request) {
  let requestId: string | undefined;
  let locale: "en" | "fr" | "ar" = "fr";
  try {
    const body = await req.json();
    requestId = body.requestId;
    if (body.locale === "en" || body.locale === "fr" || body.locale === "ar") {
      locale = body.locale;
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  // 1) Pull the request. RLS will return it only to the admin who can
  //    approve / the teacher who owns it.
  const { data: reqRowRaw, error: reqErr } = await supabase
    .from("time_off_requests")
    .select(
      "id, school_id, subject_id, start_date, end_date, status, notifications_sent_at, " +
      "subject:profiles!subject_id(id, first_name, last_name, role)"
    )
    .eq("id", requestId)
    .single();
  if (reqErr || !reqRowRaw) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  const reqRow = reqRowRaw as unknown as ReqRow;

  if (reqRow.status !== "approved") {
    return NextResponse.json({ error: "Request is not approved" }, { status: 409 });
  }
  if (reqRow.notifications_sent_at) {
    // Idempotent — caller can safely re-trigger.
    return NextResponse.json({ skipped: true, reason: "already sent" });
  }
  if (!reqRow.subject || reqRow.subject.role !== "teacher") {
    // Non-teacher time-off (student, employee) doesn't trigger this
    // engine — students don't have downstream students to notify.
    return NextResponse.json({ skipped: true, reason: "subject is not a teacher" });
  }

  // 2) Pull the teacher's lessons in this school.
  const { data: lessonsRows, error: lErr } = await supabase
    .from("lessons")
    .select("id, class_id, subject_id, day_of_week, start_time, end_time, " +
            "subject:subjects(name)")
    .eq("teacher_id", reqRow.subject.id)
    .eq("school_id", reqRow.school_id);
  if (lErr) {
    return NextResponse.json({ error: lErr.message }, { status: 500 });
  }
  const lessons = (lessonsRows as unknown as LessonResponseRow[]) ?? [];

  // 3) Compute overlap.
  const lessonInputs: LessonRow[] = lessons.map((l) => ({
    id: l.id,
    classId: l.class_id,
    subjectId: l.subject_id,
    dayOfWeek: l.day_of_week,
    startTime: l.start_time,
    endTime: l.end_time,
  }));
  const affected: AffectedSession[] = lessonsAffectedByTimeOff(
    lessonInputs, reqRow.start_date, reqRow.end_date,
  );

  if (affected.length === 0) {
    await supabase
      .from("time_off_requests")
      .update({ notifications_sent_at: new Date().toISOString() })
      .eq("id", reqRow.id);
    return NextResponse.json({ sent: 0, affectedSessions: 0 });
  }

  // 4) Subject names — keep them for nicer messages.
  const subjectNameById = new Map<string, string>();
  for (const l of lessons) {
    if (l.subject?.name) subjectNameById.set(l.subject_id, l.subject.name);
  }

  // 5) Enrolled students per affected class, plus linked parents.
  const classIds = Array.from(new Set(affected.map((a) => a.classId)));
  const { data: enrolls } = await supabase
    .from("student_classes")
    .select("class_id, student_id, profiles:student_id(user_id)")
    .in("class_id", classIds);
  type EnrollRow = {
    class_id: string;
    student_id: string;
    profiles: { user_id: string } | null;
  };
  const enrollRows = (enrolls as unknown as EnrollRow[]) ?? [];
  const studentsByClass = new Map<string, EnrollRow[]>();
  for (const e of enrollRows) {
    const arr = studentsByClass.get(e.class_id) ?? [];
    arr.push(e);
    studentsByClass.set(e.class_id, arr);
  }
  const allStudentProfileIds = Array.from(new Set(enrollRows.map((e) => e.student_id)));
  let parentLinks: { student_id: string; parent_id: string; parent_user: string | null }[] = [];
  if (allStudentProfileIds.length) {
    const { data: pl } = await supabase
      .from("parent_students")
      .select("student_id, parent_id, parent:profiles!parent_id(user_id)")
      .in("student_id", allStudentProfileIds);
    type PRow = {
      student_id: string;
      parent_id: string;
      parent: { user_id: string } | null;
    };
    parentLinks = ((pl as unknown as PRow[]) ?? []).map((p) => ({
      student_id: p.student_id,
      parent_id: p.parent_id,
      parent_user: p.parent?.user_id ?? null,
    }));
  }
  const parentsByStudent = new Map<string, string[]>();   // student_profile_id → [parent user_id]
  for (const p of parentLinks) {
    if (!p.parent_user) continue;
    const arr = parentsByStudent.get(p.student_id) ?? [];
    arr.push(p.parent_user);
    parentsByStudent.set(p.student_id, arr);
  }

  // 6) Build notification rows. Dedupe per (user, session) so a parent
  //    of two children in the same class only gets one row per session.
  const teacherName = `${reqRow.subject.first_name} ${reqRow.subject.last_name}`.trim();
  type NotifRow = {
    user_id: string;
    school_id: string;
    title: string;
    message: string;
    type: string;
    link: string;
  };
  const built: NotifRow[] = [];
  const seen = new Set<string>();

  for (const sess of affected) {
    const subjectName = subjectNameById.get(sess.subjectId) ?? "your class";
    const { title, message } = buildNotificationContent(
      teacherName, subjectName, sess, locale,
    );
    const sessionKey = `${sess.lessonId}-${sess.date}`;
    const enrolled = studentsByClass.get(sess.classId) ?? [];

    for (const e of enrolled) {
      // Student
      if (e.profiles?.user_id) {
        const k = `${e.profiles.user_id}|${sessionKey}`;
        if (!seen.has(k)) {
          seen.add(k);
          built.push({
            user_id: e.profiles.user_id,
            school_id: reqRow.school_id,
            title, message,
            type: "teacher_absence",
            link: "/student",
          });
        }
      }
      // Linked parents
      for (const pUser of parentsByStudent.get(e.student_id) ?? []) {
        const k = `${pUser}|${sessionKey}`;
        if (!seen.has(k)) {
          seen.add(k);
          built.push({
            user_id: pUser,
            school_id: reqRow.school_id,
            title, message,
            type: "teacher_absence",
            link: "/parent",
          });
        }
      }
    }
  }

  // 7) Insert in one batch. RLS from migration 025 lets admins insert
  //    notifications scoped to their school.
  if (built.length > 0) {
    const { error: insErr } = await supabase.from("notifications").insert(built);
    if (insErr) {
      // Log + report; do NOT roll back the approval. The admin's
      // approval click already succeeded before this route ran.
      console.error("[/api/timeoff/notify-students] insert failed:", insErr);
      return NextResponse.json(
        { error: insErr.message, sent: 0, attempted: built.length },
        { status: 500 },
      );
    }
  }

  // 8) Mark the request so a re-trigger is a no-op.
  await supabase
    .from("time_off_requests")
    .update({ notifications_sent_at: new Date().toISOString() })
    .eq("id", reqRow.id);

  return NextResponse.json({
    sent: built.length,
    affectedSessions: affected.length,
    classes: classIds.length,
  });
}
