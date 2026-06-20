"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface ClassRow {
  class_id: string;
  class_name: string;
  subject_name: string;
}

interface Props {
  /** Pre-select a class (used when launching from an assignment row). */
  defaultClassId?: string;
  /** Pre-fill the subject of the reminder. */
  defaultSubject?: string;
  /** Pre-select reminder type (exam | test | homework). */
  defaultType?: ReminderType;
  /** Pre-fill the due date input. */
  defaultDueAt?: string;
  /** Called after a successful send; receives the number of recipients. */
  onSent?: (count: number) => void;
  /** Triggered when the modal closes (saved or cancelled). */
  onClose: () => void;
}

type ReminderType = "exam" | "test" | "homework" | "general";

const TYPE_META: Record<ReminderType, { label: string; icon: string; tone: string }> = {
  exam:     { label: "Exam",     icon: "📝", tone: "bg-red-50 text-red-700 border-red-200" },
  test:     { label: "Test",     icon: "🧪", tone: "bg-orange-50 text-orange-700 border-orange-200" },
  homework: { label: "Homework", icon: "📚", tone: "bg-blue-50 text-blue-700 border-blue-200" },
  general:  { label: "General",  icon: "📣", tone: "bg-gray-50 text-gray-700 border-gray-200" },
};

const ReminderComposer = ({
  defaultClassId, defaultSubject, defaultType = "homework", defaultDueAt, onSent, onClose,
}: Props) => {
  const { user } = useAuth();
  const supabase = createClient();

  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState(defaultClassId || "");
  const [type, setType] = useState<ReminderType>(defaultType);
  const [subject, setSubject] = useState(defaultSubject || "");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState(defaultDueAt || "");
  const [notifyParents, setNotifyParents] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [parentCount, setParentCount] = useState<number | null>(null);

  // Load this teacher's class assignments for the picker.
  useEffect(() => {
    if (!supabase || !user?.profileId) return;
    (async () => {
      const { data } = await supabase
        .from("class_subjects")
        .select("class_id, classes:class_id(name), subjects:subject_id(name)")
        .eq("teacher_id", user.profileId);
      const rows = Array.from(
        new Map((data || []).map((r: any) => [
          r.class_id,
          { class_id: r.class_id, class_name: r.classes?.name || "Class", subject_name: r.subjects?.name || "" },
        ])).values()
      );
      setClasses(rows);
      if (!defaultClassId && rows.length > 0) setClassId(rows[0].class_id);
    })();
  }, [user?.profileId]);

  // Refresh the recipient count whenever class or notifyParents changes.
  useEffect(() => {
    if (!supabase || !classId) { setStudentCount(null); setParentCount(null); return; }
    (async () => {
      const { data: enrollments } = await supabase
        .from("student_classes")
        .select("student_id")
        .eq("class_id", classId);
      const studentIds = (enrollments || []).map((e: any) => e.student_id);
      setStudentCount(studentIds.length);

      if (!notifyParents) { setParentCount(0); return; }
      if (studentIds.length === 0) { setParentCount(0); return; }
      const { data: links } = await supabase
        .from("parent_students")
        .select("parent_id")
        .in("student_id", studentIds);
      const parents = Array.from(new Set((links || []).map((l: any) => l.parent_id)));
      setParentCount(parents.length);
    })();
  }, [classId, notifyParents]);

  const canSend = useMemo(
    () => !!classId && !!subject.trim() && !!body.trim() && !sending,
    [classId, subject, body, sending],
  );

  const send = async () => {
    if (!supabase || !user?.schoolId || !canSend) return;
    setSending(true);
    setError(null);

    // 1. Resolve recipients (students of the class + optionally their parents).
    const { data: enrollments, error: enrErr } = await supabase
      .from("student_classes")
      .select("student_id")
      .eq("class_id", classId);
    if (enrErr) { setError(enrErr.message); setSending(false); return; }
    const studentProfileIds = (enrollments || []).map((e: any) => e.student_id);

    let recipientProfileIds = [...studentProfileIds];
    if (notifyParents && studentProfileIds.length > 0) {
      const { data: links } = await supabase
        .from("parent_students")
        .select("parent_id")
        .in("student_id", studentProfileIds);
      const parents = Array.from(new Set((links || []).map((l: any) => l.parent_id)));
      recipientProfileIds = Array.from(new Set([...recipientProfileIds, ...parents]));
    }

    if (recipientProfileIds.length === 0) {
      setError("This class has no students yet.");
      setSending(false);
      return;
    }

    // 2. notifications.user_id references auth.users — convert profile ids.
    const { data: profiles, error: profErr } = await supabase
      .from("profiles")
      .select("user_id")
      .in("id", recipientProfileIds);
    if (profErr) { setError(profErr.message); setSending(false); return; }
    const userIds = (profiles || []).map((p: any) => p.user_id);

    // 3. Build notification rows. Title carries the type + subject; message
    //    appends the due date if one was provided.
    const meta = TYPE_META[type];
    const dueLine = dueAt ? `\n\n🗓 Due: ${new Date(dueAt).toLocaleString()}` : "";
    const title = `${meta.icon} ${meta.label}: ${subject.trim()}`;
    const message = `${body.trim()}${dueLine}`;

    const rows = userIds.map((uid) => ({
      user_id: uid,
      school_id: user.schoolId,
      title,
      message,
      type: `reminder:${type}`,
      link: "/list/assignments",
    }));

    const { error: insErr } = await supabase.from("notifications").insert(rows);
    if (insErr) { setError(insErr.message); setSending(false); return; }

    setSending(false);
    onSent?.(rows.length);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Send Reminder</h2>
            <p className="text-xs text-gray-400">Notify a class about an upcoming test, exam or due homework.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Type pills */}
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide">Reminder type</label>
            <div className="mt-1.5 grid grid-cols-4 gap-2">
              {(Object.keys(TYPE_META) as ReminderType[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setType(k)}
                  className={`text-[11px] font-medium px-2 py-2 rounded-lg border transition-all ${
                    type === k ? `${TYPE_META[k].tone} ring-2 ring-offset-1 ring-blue-200` : "border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <span className="mr-1">{TYPE_META[k].icon}</span>{TYPE_META[k].label}
                </button>
              ))}
            </div>
          </div>

          {/* Class picker */}
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide">Class</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="" disabled>Select a class</option>
              {classes.map((c) => (
                <option key={c.class_id} value={c.class_id}>
                  {c.class_name}{c.subject_name ? ` — ${c.subject_name}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Subject + due date */}
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-wide">Title</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Chapter 4 review test"
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-wide">When (optional)</label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Bring a calculator. Review pages 110–140 before the test."
              className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>

          {/* Notify parents */}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={notifyParents}
              onChange={(e) => setNotifyParents(e.target.checked)}
            />
            Also notify linked parents
          </label>

          {/* Recipient summary */}
          {studentCount !== null && (
            <div className="text-[12px] text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
              Will reach <span className="font-semibold text-gray-700">{studentCount}</span> student{studentCount !== 1 && "s"}
              {notifyParents && parentCount !== null && (
                <> and <span className="font-semibold text-gray-700">{parentCount}</span> parent{parentCount !== 1 && "s"}</>
              )}
              .
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t bg-gray-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={!canSend}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            {sending ? "Sending..." : "Send reminder"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReminderComposer;
