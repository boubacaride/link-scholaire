"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { SubmissionStatus } from "@/types";

interface AssignmentItem {
  id: string;
  title: string;
  description: string | null;
  type: string;
  due_date: string | null;
  max_score: number | null;
  subject_name: string;
  class_name: string;
  // submission
  submission_id: string | null;
  status: SubmissionStatus | "missing";
  score: number | null;
  feedback: string | null;
  text_response: string | null;
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "To do", color: "bg-gray-100 text-gray-600" },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-700" },
  late: { label: "Late", color: "bg-orange-100 text-orange-700" },
  graded: { label: "Graded", color: "bg-green-100 text-green-700" },
  returned: { label: "Returned", color: "bg-purple-100 text-purple-700" },
  missing: { label: "Missing", color: "bg-red-100 text-red-700" },
};

/** Student assignments: due dates, submission status, feedback, and a quick
 *  way to turn work in. */
const StudentAssignments = () => {
  const { user } = useAuth();
  const supabase = createClient();

  const [items, setItems] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    if (!supabase || !user?.profileId) { setLoading(false); return; }

    const { data: enrollments } = await supabase
      .from("student_classes")
      .select("class_id")
      .eq("student_id", user.profileId);
    const classIds = (enrollments || []).map((e: any) => e.class_id);
    if (classIds.length === 0) { setItems([]); setLoading(false); return; }

    const { data: content } = await supabase
      .from("content")
      .select("id, title, description, type, due_date, max_score, subject:subject_id(name), class:class_id(name)")
      .in("class_id", classIds)
      .in("type", ["assignment", "classwork"])
      .eq("is_published", true)
      .order("due_date", { ascending: true });

    const contentIds = (content || []).map((c: any) => c.id);
    const subsByContent: Record<string, any> = {};
    if (contentIds.length > 0) {
      const { data: subs } = await supabase
        .from("submissions")
        .select("id, content_id, status, score, feedback, text_response")
        .eq("student_id", user.profileId)
        .in("content_id", contentIds);
      (subs || []).forEach((s: any) => { subsByContent[s.content_id] = s; });
    }

    const now = Date.now();
    const mapped: AssignmentItem[] = (content || []).map((c: any) => {
      const sub = subsByContent[c.id];
      let status: AssignmentItem["status"];
      if (sub) status = sub.status;
      else if (c.due_date && new Date(c.due_date).getTime() < now) status = "missing";
      else status = "pending";
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        type: c.type,
        due_date: c.due_date,
        max_score: c.max_score,
        subject_name: c.subject?.name || "",
        class_name: c.class?.name || "",
        submission_id: sub?.id || null,
        status,
        score: sub?.score ?? null,
        feedback: sub?.feedback ?? null,
        text_response: sub?.text_response ?? null,
      };
    });
    setItems(mapped);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.profileId]);

  const submit = async (item: AssignmentItem) => {
    if (!supabase || !user?.profileId) return;
    setSubmitting(true);
    const past = item.due_date && new Date(item.due_date).getTime() < Date.now();
    const status: SubmissionStatus = past ? "late" : "submitted";
    const payload = {
      content_id: item.id,
      student_id: user.profileId,
      text_response: draft.trim() || null,
      status,
      submitted_at: new Date().toISOString(),
    };
    // upsert: insert, or update if a row already exists
    const { error } = await supabase
      .from("submissions")
      .upsert(payload, { onConflict: "content_id,student_id" });
    if (!error) {
      setOpenId(null);
      setDraft("");
      await load();
    }
    setSubmitting(false);
  };

  const grouped = useMemo(() => {
    const todo = items.filter((i) => i.status === "pending" || i.status === "missing" || i.status === "late");
    const done = items.filter((i) => i.status === "submitted" || i.status === "graded" || i.status === "returned");
    return { todo, done };
  }, [items]);

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">Loading assignments...</div>;

  if (items.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-2">✅</div>
        <p className="text-gray-500 text-sm">No assignments right now.</p>
        <p className="text-gray-400 text-xs mt-1">New work from your teachers will appear here.</p>
      </div>
    );
  }

  const renderItem = (item: AssignmentItem) => {
    const meta = STATUS_META[item.status];
    const dueSoon = item.due_date && new Date(item.due_date).getTime() - Date.now() < 3 * 86400000 && (item.status === "pending");
    const canSubmit = item.status === "pending" || item.status === "missing" || item.status === "late";
    return (
      <div key={item.id} className="border rounded-xl p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800">{item.title}</p>
            <p className="text-xs text-gray-400">{item.subject_name} • {item.class_name}</p>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${meta.color}`}>{meta.label}</span>
        </div>
        {item.description && <p className="text-xs text-gray-500 mt-1.5">{item.description}</p>}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {item.due_date && (
            <span className={`text-[11px] ${dueSoon ? "text-orange-600 font-medium" : "text-gray-400"}`}>
              📅 Due {new Date(item.due_date).toLocaleDateString()}
            </span>
          )}
          {item.score !== null && item.max_score && (
            <span className="text-[11px] font-medium text-green-600">Score: {item.score}/{item.max_score}</span>
          )}
          {canSubmit && (
            <button
              onClick={() => { setOpenId(openId === item.id ? null : item.id); setDraft(item.text_response || ""); }}
              className="ml-auto text-[11px] bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-green-700 transition-colors"
            >
              {openId === item.id ? "Close" : "Submit work"}
            </button>
          )}
        </div>
        {item.feedback && (
          <div className="mt-2 bg-purple-50 border border-purple-100 rounded-lg p-2.5">
            <p className="text-[10px] text-purple-500 uppercase tracking-wide font-medium">Teacher feedback</p>
            <p className="text-xs text-purple-800 mt-0.5">{item.feedback}</p>
          </div>
        )}
        {openId === item.id && (
          <div className="mt-2 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="Type your response or paste a link to your work..."
              className="w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-green-200 resize-none"
            />
            <button
              onClick={() => submit(item)}
              disabled={submitting}
              className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-40"
            >
              {submitting ? "Submitting..." : "Turn in"}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">To do ({grouped.todo.length})</h3>
        {grouped.todo.length === 0 ? (
          <p className="text-xs text-gray-400">You&apos;re all caught up! 🎉</p>
        ) : (
          <div className="space-y-2">{grouped.todo.map(renderItem)}</div>
        )}
      </div>
      {grouped.done.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Completed ({grouped.done.length})</h3>
          <div className="space-y-2">{grouped.done.map(renderItem)}</div>
        </div>
      )}
    </div>
  );
};

export default StudentAssignments;
