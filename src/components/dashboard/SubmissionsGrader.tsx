"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";

interface Sub {
  id: string;
  student_id: string;
  student_name: string;
  status: string;
  score: number | null;
  feedback: string | null;
  text_response: string | null;
  submitted_at: string | null;
}

interface ContentItem {
  id: string;
  title: string;
  type: string;
  due_date: string | null;
  max_score: number | null;
  class_id: string;
  subject_name: string;
  class_name: string;
  subs: Sub[];
  enrolledCount: number;
  notSubmitted: string[]; // student names with no submission
}

const TERMS = ["Term 1", "Term 2", "Term 3", "Final"];
const isGraded = (s: Sub) => s.status === "graded" || s.status === "returned";

/** Teacher "To Grade" surface: every assignment/classwork the teacher owns,
 *  the student work turned in for it, and an inline grade-and-post action.
 *  Grading posts to the student's gradebook + progress book (grade_submission RPC). */
const SubmissionsGrader = () => {
  const { user } = useAuth();
  const supabase = createClient();
  const { t } = useI18n();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [term, setTerm] = useState("Term 1");
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({});
  const [fbDraft, setFbDraft] = useState<Record<string, string>>({});
  const [showText, setShowText] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  const load = async () => {
    if (!supabase || !user?.profileId) { setLoading(false); return; }
    setLoading(true);

    const { data: content } = await supabase
      .from("content")
      .select("id, title, type, due_date, max_score, class_id, subject:subject_id(name), class:class_id(name)")
      .eq("teacher_id", user.profileId)
      .in("type", ["assignment", "classwork"])
      .order("due_date", { ascending: false });

    const contentList = content || [];
    const contentIds = contentList.map((c: any) => c.id);
    const classIds = Array.from(new Set(contentList.map((c: any) => c.class_id)));

    // Submissions for all of the teacher's content
    const subsByContent: Record<string, Sub[]> = {};
    if (contentIds.length > 0) {
      const { data: subs } = await supabase
        .from("submissions")
        .select("id, content_id, student_id, status, score, feedback, text_response, submitted_at, student:student_id(first_name, last_name)")
        .in("content_id", contentIds);
      (subs || []).forEach((s: any) => {
        if (s.status === "pending") return; // not actually turned in yet
        (subsByContent[s.content_id] ||= []).push({
          id: s.id,
          student_id: s.student_id,
          student_name: `${s.student?.first_name || ""} ${s.student?.last_name || ""}`.trim() || "Student",
          status: s.status,
          score: s.score,
          feedback: s.feedback,
          text_response: s.text_response,
          submitted_at: s.submitted_at,
        });
      });
    }

    // Rosters per class (to show who hasn't submitted)
    const enrolledByClass: Record<string, { id: string; name: string }[]> = {};
    if (classIds.length > 0) {
      const { data: enr } = await supabase
        .from("student_classes")
        .select("class_id, student:student_id(id, first_name, last_name)")
        .in("class_id", classIds);
      (enr || []).forEach((e: any) => {
        if (!e.student) return;
        (enrolledByClass[e.class_id] ||= []).push({
          id: e.student.id,
          name: `${e.student.first_name} ${e.student.last_name}`,
        });
      });
    }

    const mapped: ContentItem[] = contentList.map((c: any) => {
      const subs = (subsByContent[c.id] || []).sort((a, b) => a.student_name.localeCompare(b.student_name));
      const enrolled = enrolledByClass[c.class_id] || [];
      const submittedIds = new Set(subs.map((s) => s.student_id));
      const notSubmitted = enrolled.filter((e) => !submittedIds.has(e.id)).map((e) => e.name);
      return {
        id: c.id,
        title: c.title,
        type: c.type,
        due_date: c.due_date,
        max_score: c.max_score,
        class_id: c.class_id,
        subject_name: c.subject?.name || "",
        class_name: c.class?.name || "",
        subs,
        enrolledCount: enrolled.length,
        notSubmitted,
      };
    });
    setItems(mapped);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.profileId]);

  const gradeSub = async (item: ContentItem, sub: Sub) => {
    if (!supabase) return;
    const raw = scoreDraft[sub.id] ?? (sub.score != null ? String(sub.score) : "");
    const score = parseFloat(raw);
    if (raw === "" || isNaN(score)) return;
    const feedback = (fbDraft[sub.id] ?? sub.feedback ?? "").trim() || null;
    setBusyId(sub.id);
    const { data, error } = await supabase.rpc("grade_submission", {
      p_submission_id: sub.id,
      p_score: score,
      p_max_score: item.max_score || 100,
      p_feedback: feedback,
      p_term: term,
      p_exam_type: item.title,
    });
    setBusyId(null);
    if (!error && data && (data as any).success) {
      setItems((prev) =>
        prev.map((it) =>
          it.id !== item.id
            ? it
            : { ...it, subs: it.subs.map((s) => (s.id !== sub.id ? s : { ...s, status: "graded", score: Math.round(score), feedback })) }
        )
      );
      setDoneId(sub.id);
      setTimeout(() => setDoneId((id) => (id === sub.id ? null : id)), 1600);
    }
  };

  const totals = useMemo(() => {
    let toGrade = 0;
    for (const it of items) toGrade += it.subs.filter((s) => !isGraded(s)).length;
    return { toGrade };
  }, [items]);

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">{t("grade.loading")}</div>;

  if (items.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-2">📥</div>
        <p className="text-gray-500 text-sm">{t("grade.noContent")}</p>
        <p className="text-gray-400 text-xs mt-1">{t("grade.noContentHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Term + posting hint */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[160px]">
          <label className="text-[10px] text-gray-400 uppercase tracking-wide">{t("grade.term")}</label>
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {TERMS.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
          </select>
        </div>
        {totals.toGrade > 0 && (
          <div className="bg-amber-50 rounded-lg px-4 py-2 text-center">
            <p className="text-[10px] text-amber-500 uppercase tracking-wide">{t("grade.toGrade")}</p>
            <p className="text-lg font-bold text-amber-700">{totals.toGrade}</p>
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400">{t("grade.postedHint")}</p>

      {/* Assignments */}
      <div className="space-y-2.5">
        {items.map((item) => {
          const pending = item.subs.filter((s) => !isGraded(s)).length;
          const graded = item.subs.filter(isGraded).length;
          const open = openId === item.id;
          return (
            <div key={item.id} className="border rounded-xl overflow-hidden">
              <button
                onClick={() => setOpenId(open ? null : item.id)}
                className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.title}</p>
                  <p className="text-xs text-gray-400">
                    {item.subject_name} • {item.class_name}
                    {item.due_date && <> • {t("grade.due", { date: new Date(item.due_date).toLocaleDateString() })}</>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {pending > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                      {pending} {t("grade.toGrade")}
                    </span>
                  )}
                  {graded > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                      {graded} {t("grade.graded")}
                    </span>
                  )}
                  {item.notSubmitted.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                      {item.notSubmitted.length} {t("grade.awaiting")}
                    </span>
                  )}
                  <span className="text-gray-300 text-xs ml-1">{open ? "▲" : "▼"}</span>
                </div>
              </button>

              {open && (
                <div className="border-t divide-y">
                  {item.subs.length === 0 ? (
                    <p className="px-4 py-4 text-center text-xs text-gray-400">{t("grade.notSubmitted")}</p>
                  ) : (
                    item.subs.map((sub) => {
                      const graded = isGraded(sub);
                      const showW = showText[sub.id];
                      const scoreVal = scoreDraft[sub.id] ?? (sub.score != null ? String(sub.score) : "");
                      const fbVal = fbDraft[sub.id] ?? sub.feedback ?? "";
                      return (
                        <div key={sub.id} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${graded ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                                {sub.student_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm text-gray-800 truncate">{sub.student_name}</p>
                                {sub.submitted_at && (
                                  <p className="text-[11px] text-gray-400">{t("grade.submittedOn", { date: new Date(sub.submitted_at).toLocaleDateString() })}</p>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => setShowText((p) => ({ ...p, [sub.id]: !p[sub.id] }))}
                              className="text-[11px] text-blue-600 hover:text-blue-800 shrink-0"
                            >
                              {showW ? t("grade.hideWork") : t("grade.viewWork")}
                            </button>
                          </div>

                          {showW && (
                            <div className="mt-2 bg-gray-50 border rounded-lg p-2.5">
                              <p className="text-xs text-gray-700 whitespace-pre-wrap">
                                {sub.text_response || <span className="text-gray-400 italic">{t("grade.noText")}</span>}
                              </p>
                            </div>
                          )}

                          <div className="mt-2 flex flex-wrap items-end gap-2">
                            <div>
                              <label className="text-[10px] text-gray-400 uppercase tracking-wide">{t("grade.scoreLabel")}</label>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={item.max_score || undefined}
                                  value={scoreVal}
                                  onChange={(e) => setScoreDraft((p) => ({ ...p, [sub.id]: e.target.value }))}
                                  placeholder={`/ ${item.max_score || 100}`}
                                  className="w-20 text-sm px-2 py-1.5 rounded-lg border text-center focus:outline-none focus:ring-2 focus:ring-blue-200"
                                />
                                <span className="text-xs text-gray-400">/ {item.max_score || 100}</span>
                              </div>
                            </div>
                            <div className="flex-1 min-w-[180px]">
                              <label className="text-[10px] text-gray-400 uppercase tracking-wide">{t("grade.feedbackLabel")}</label>
                              <input
                                value={fbVal}
                                onChange={(e) => setFbDraft((p) => ({ ...p, [sub.id]: e.target.value }))}
                                placeholder={t("grade.feedbackPlaceholder")}
                                className="mt-0.5 w-full text-sm px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
                              />
                            </div>
                            <button
                              onClick={() => gradeSub(item, sub)}
                              disabled={busyId === sub.id || scoreVal === ""}
                              className={`text-xs font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-40 ${
                                doneId === sub.id ? "bg-green-100 text-green-700" : "bg-blue-600 text-white hover:bg-blue-700"
                              }`}
                            >
                              {doneId === sub.id ? t("grade.posted") : busyId === sub.id ? t("grade.posting") : graded ? t("grade.regrade") : t("grade.gradePost")}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {item.notSubmitted.length > 0 && (
                    <div className="px-4 py-3 bg-gray-50/50">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">{t("grade.notSubmitted")} ({item.notSubmitted.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {item.notSubmitted.map((name) => (
                          <span key={name} className="text-[11px] bg-white border text-gray-500 px-2 py-0.5 rounded-full">{name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SubmissionsGrader;
