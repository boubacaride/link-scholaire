"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";

interface GradeRow {
  subject_id: string;
  subject_name: string;
  exam_type: string;
  score: number;
  max_score: number;
  created_at: string;
}

type WorkBucket = "missing" | "submitted" | "graded";
interface WorkItem {
  id: string;
  title: string;
  subject_name: string;
  due_date: string | null;
  bucket: WorkBucket;
  score: number | null;
  max_score: number | null;
}

interface ProgressTrackerProps {
  /** Whose progress to show. Defaults to the signed-in user (student view). */
  studentId?: string;
}

/** The shared "progress book": per-subject averages PLUS a breakdown of the
 *  student's work into missing / submitted / graded. Used by students for
 *  themselves and (read-only) by parents for their child. */
const ProgressTracker = ({ studentId }: ProgressTrackerProps) => {
  const { user } = useAuth();
  const supabase = createClient();
  const { t } = useI18n();
  const targetId = studentId || user?.profileId;

  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [work, setWork] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!supabase || !targetId) { setLoading(false); return; }
      setLoading(true);

      // ── Per-subject averages (from posted grades) ──
      const { data } = await supabase
        .from("grades")
        .select("subject_id, exam_type, score, max_score, created_at, subject:subject_id(name)")
        .eq("student_id", targetId)
        .order("created_at", { ascending: true });
      setGrades(
        (data || []).map((g: any) => ({
          subject_id: g.subject_id,
          subject_name: g.subject?.name || "Subject",
          exam_type: g.exam_type || "",
          score: g.score,
          max_score: g.max_score,
          created_at: g.created_at,
        }))
      );

      // Map a posted grade back to the assignment it came from, so a graded
      // assignment counts as "graded" even when there is no submission row
      // (e.g. the teacher recorded the grade straight into the gradebook).
      const gKey = (subjectId: string, examType: string) =>
        `${subjectId}|::|${(examType || "").trim().toLowerCase()}`;
      const gradeMap = new Map<string, { score: number; max: number }>();
      (data || []).forEach((g: any) =>
        gradeMap.set(gKey(g.subject_id, g.exam_type), { score: g.score, max: g.max_score })
      );

      // ── Work breakdown: missing / submitted / graded ──
      const { data: enr } = await supabase
        .from("student_classes")
        .select("class_id")
        .eq("student_id", targetId);
      const classIds = (enr || []).map((e: any) => e.class_id);
      let workItems: WorkItem[] = [];
      if (classIds.length > 0) {
        const { data: content } = await supabase
          .from("content")
          .select("id, title, due_date, max_score, subject_id, subject:subject_id(name)")
          .in("class_id", classIds)
          .in("type", ["assignment", "classwork"])
          .eq("is_published", true)
          .order("due_date", { ascending: true });
        const cIds = (content || []).map((c: any) => c.id);
        const subByContent: Record<string, any> = {};
        if (cIds.length > 0) {
          const { data: subs } = await supabase
            .from("submissions")
            .select("content_id, status, score")
            .eq("student_id", targetId)
            .in("content_id", cIds);
          (subs || []).forEach((s: any) => { subByContent[s.content_id] = s; });
        }
        const now = Date.now();
        workItems = (content || []).flatMap((c: any) => {
          const s = subByContent[c.id];
          const status = s?.status;
          const gradeHit = gradeMap.get(gKey(c.subject_id, c.title));
          let bucket: WorkBucket | null = null;
          let score: number | null = null;
          let max: number | null = c.max_score;
          // A posted grade is the strongest signal — it means the work is done
          // and marked, so it belongs in "graded" regardless of submission state.
          if (gradeHit) {
            bucket = "graded"; score = gradeHit.score; max = gradeHit.max ?? c.max_score;
          } else if (status === "graded" || status === "returned") {
            bucket = "graded"; score = s?.score ?? null;
          } else if (status === "submitted" || status === "late") {
            bucket = "submitted";
          } else if (c.due_date && new Date(c.due_date).getTime() < now) {
            bucket = "missing";
          }
          if (!bucket) return [];
          return [{
            id: c.id, title: c.title, subject_name: c.subject?.name || "",
            due_date: c.due_date, bucket, score, max_score: max,
          }];
        });
      }
      setWork(workItems);
      setLoading(false);
    };
    load();
  }, [targetId]);

  const subjects = useMemo(() => {
    const map = new Map<string, GradeRow[]>();
    for (const g of grades) {
      const arr = map.get(g.subject_id) || [];
      arr.push(g);
      map.set(g.subject_id, arr);
    }
    return Array.from(map.entries()).map(([id, rows]) => {
      const pcts = rows.map((r) => (r.score / r.max_score) * 100);
      const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      // trend: average of the most recent half vs the earlier half
      let trend = 0;
      if (pcts.length >= 2) {
        const mid = Math.floor(pcts.length / 2);
        const earlier = pcts.slice(0, mid);
        const recent = pcts.slice(mid);
        const ea = earlier.reduce((a, b) => a + b, 0) / earlier.length;
        const ra = recent.reduce((a, b) => a + b, 0) / recent.length;
        trend = ra - ea;
      }
      return { id, name: rows[0].subject_name, avg, count: rows.length, trend };
    }).sort((a, b) => b.avg - a.avg);
  }, [grades]);

  const buckets = useMemo(() => ({
    missing: work.filter((w) => w.bucket === "missing"),
    submitted: work.filter((w) => w.bucket === "submitted"),
    graded: work.filter((w) => w.bucket === "graded"),
  }), [work]);

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">{t("wdg.loadingProgress")}</div>;

  if (subjects.length === 0 && work.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-2">📋</div>
        <p className="text-gray-500 text-sm">{t("wdg.noGradedSubjects")}</p>
        <p className="text-gray-400 text-xs mt-1">{t("wdg.progressShows")}</p>
      </div>
    );
  }

  const WORK_META: Record<WorkBucket, { label: string; dot: string; text: string }> = {
    missing: { label: t("grade.missing"), dot: "bg-red-500", text: "text-red-600" },
    submitted: { label: t("grade.submitted"), dot: "bg-amber-500", text: "text-amber-600" },
    graded: { label: t("grade.gradedWork"), dot: "bg-green-500", text: "text-green-600" },
  };

  const renderBucket = (key: WorkBucket) => {
    const list = buckets[key];
    if (list.length === 0) return null;
    const meta = WORK_META[key];
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
          <span className="text-xs font-semibold text-gray-700">{meta.label}</span>
          <span className="text-[10px] text-gray-400">({list.length})</span>
        </div>
        <div className="space-y-1.5">
          {list.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-2 bg-white border rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-800 truncate">{w.title}</p>
                <p className="text-[11px] text-gray-400">
                  {w.subject_name}
                  {w.due_date && <> • {t("grade.due", { date: new Date(w.due_date).toLocaleDateString() })}</>}
                </p>
              </div>
              {key === "graded" && w.score != null ? (
                <span className="text-sm font-semibold text-green-600 shrink-0">{w.score}{w.max_score ? `/${w.max_score}` : ""}</span>
              ) : (
                <span className={`text-[11px] font-medium shrink-0 ${meta.text}`}>{meta.label}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Subjects */}
      {subjects.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t("grade.subjectsHeading")}</h3>
          <div className="space-y-3">
            {subjects.map((s) => {
              const color = s.avg >= 80 ? "bg-green-500" : s.avg >= 60 ? "bg-blue-500" : s.avg >= 50 ? "bg-orange-500" : "bg-red-500";
              return (
                <div key={s.id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{s.name}</span>
                      <span className="text-[10px] text-gray-400">{s.count} grade{s.count !== 1 ? "s" : ""}</span>
                      {Math.abs(s.trend) >= 1 && (
                        <span className={`text-[10px] font-medium ${s.trend > 0 ? "text-green-600" : "text-red-500"}`}>
                          {s.trend > 0 ? "▲" : "▼"} {Math.abs(s.trend).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-700">{s.avg.toFixed(0)}%</span>
                  </div>
                  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, s.avg)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Assignments & work */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t("grade.workHeading")}</h3>
        {work.length === 0 ? (
          <p className="text-xs text-gray-400">{t("grade.allCaughtUp")}</p>
        ) : (
          <div className="space-y-4">
            {renderBucket("missing")}
            {renderBucket("submitted")}
            {renderBucket("graded")}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProgressTracker;
