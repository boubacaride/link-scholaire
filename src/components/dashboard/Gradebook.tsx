"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";

interface Assignment {
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
}

interface GradeRow {
  id: string;
  student_id: string;
  exam_type: string;
  score: number;
  max_score: number;
  term: string;
  created_at: string;
}

const TERMS = ["Term 1", "Term 2", "Term 3", "Final"];

/** Teacher grades dashboard: pick a class+subject, configure an assessment,
 *  then record a score for each student and track class performance. */
const Gradebook = () => {
  const { user } = useAuth();
  const supabase = createClient();
  const { t } = useI18n();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selected, setSelected] = useState<string>(""); // `${class_id}|${subject_id}`
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(false);

  // assessment config
  const [examType, setExamType] = useState("Quiz");
  const [term, setTerm] = useState("Term 1");
  const [maxScore, setMaxScore] = useState(20);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // ── Load teacher's class/subject assignments ──
  useEffect(() => {
    const load = async () => {
      if (!supabase || !user?.profileId) { setLoading(false); return; }
      const { data } = await supabase
        .from("class_subjects")
        .select("class_id, subject_id, classes:class_id(name), subjects:subject_id(name)")
        .eq("teacher_id", user.profileId);
      if (data) {
        const mapped: Assignment[] = data.map((cs: any) => ({
          class_id: cs.class_id,
          subject_id: cs.subject_id,
          class_name: cs.classes?.name || "Class",
          subject_name: cs.subjects?.name || "Subject",
        }));
        setAssignments(mapped);
        if (mapped.length > 0) setSelected(`${mapped[0].class_id}|${mapped[0].subject_id}`);
      }
      setLoading(false);
    };
    load();
  }, [user?.profileId]);

  const [classId, subjectId] = selected ? selected.split("|") : ["", ""];
  const current = assignments.find((a) => a.class_id === classId && a.subject_id === subjectId);

  // ── Load roster + existing grades for the chosen class/subject ──
  useEffect(() => {
    const load = async () => {
      if (!supabase || !classId || !subjectId) return;
      setLoadingRoster(true);
      const { data: enrollments } = await supabase
        .from("student_classes")
        .select("student:student_id(id, first_name, last_name)")
        .eq("class_id", classId);
      const roster: Student[] = (enrollments || [])
        .map((e: any) => e.student)
        .filter(Boolean)
        .sort((a: Student, b: Student) => a.first_name.localeCompare(b.first_name));
      setStudents(roster);

      const { data: gradeData } = await supabase
        .from("grades")
        .select("id, student_id, exam_type, score, max_score, term, created_at")
        .eq("class_id", classId)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false });
      setGrades((gradeData as GradeRow[]) || []);
      setScores({});
      setLoadingRoster(false);
    };
    load();
  }, [classId, subjectId]);

  const avgByStudent = useMemo(() => {
    const map: Record<string, { sum: number; n: number }> = {};
    for (const g of grades) {
      const pct = (g.score / g.max_score) * 100;
      const e = map[g.student_id] || { sum: 0, n: 0 };
      e.sum += pct; e.n += 1;
      map[g.student_id] = e;
    }
    return map;
  }, [grades]);

  const classAvg = useMemo(() => {
    const vals = Object.values(avgByStudent).map((e) => e.sum / e.n);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [avgByStudent]);

  const saveGrade = async (student: Student) => {
    const raw = scores[student.id];
    if (raw === undefined || raw === "") return;
    const score = parseFloat(raw);
    if (isNaN(score) || !supabase || !user?.profileId || !user?.schoolId) return;
    setSavingId(student.id);
    const { data, error } = await supabase
      .from("grades")
      .insert({
        school_id: user.schoolId,
        student_id: student.id,
        class_id: classId,
        subject_id: subjectId,
        exam_type: examType || "Assessment",
        score,
        max_score: maxScore,
        term,
        recorded_by: user.profileId,
      })
      .select("id, student_id, exam_type, score, max_score, term, created_at")
      .single();
    if (!error && data) {
      setGrades((prev) => [data as GradeRow, ...prev]);
      setScores((prev) => ({ ...prev, [student.id]: "" }));
      setSavedId(student.id);
      setTimeout(() => setSavedId((id) => (id === student.id ? null : id)), 1500);
    }
    setSavingId(null);
  };

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">{t("wdg.loadingGradebook")}</div>;

  if (assignments.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-2">📊</div>
        <p className="text-gray-500 text-sm">{t("wdg.noClassesAssigned")}</p>
        <p className="text-gray-400 text-xs mt-1">{t("wdg.askAdminAssign")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-gray-400 uppercase tracking-wide">Class &amp; Subject</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {assignments.map((a) => (
              <option key={`${a.class_id}|${a.subject_id}`} value={`${a.class_id}|${a.subject_id}`}>
                {a.class_name} — {a.subject_name}
              </option>
            ))}
          </select>
        </div>
        {classAvg !== null && (
          <div className="bg-blue-50 rounded-lg px-4 py-2 text-center">
            <p className="text-[10px] text-blue-500 uppercase tracking-wide">{t("wdg.classAvg")}</p>
            <p className="text-lg font-bold text-blue-700">{classAvg.toFixed(1)}%</p>
          </div>
        )}
      </div>

      {/* Assessment config */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-gray-50 rounded-xl p-3 border">
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide">Assessment</label>
          <input
            value={examType}
            onChange={(e) => setExamType(e.target.value)}
            placeholder="Quiz, Exam, Homework..."
            className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide">Term</label>
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-gray-400 uppercase tracking-wide">Max Score</label>
          <input
            type="number"
            min={1}
            value={maxScore}
            onChange={(e) => setMaxScore(Number(e.target.value) || 1)}
            className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>

      {/* Roster with grade entry */}
      <div className="border rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 bg-gray-50 px-4 py-2 text-[11px] font-medium text-gray-500 uppercase tracking-wide">
          <div className="col-span-5">{t("wdg.student")}</div>
          <div className="col-span-3 text-center">{t("wdg.average")}</div>
          <div className="col-span-4 text-right">{t("wdg.recordScore")}</div>
        </div>
        {loadingRoster ? (
          <div className="p-6 text-center text-gray-400 text-sm">{t("wdg.loadingRoster")}</div>
        ) : students.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">{t("wdg.noStudentsEnrolled")}</div>
        ) : (
          <div className="divide-y">
            {students.map((s) => {
              const avg = avgByStudent[s.id] ? avgByStudent[s.id].sum / avgByStudent[s.id].n : null;
              return (
                <div key={s.id} className="grid grid-cols-12 gap-2 items-center px-4 py-2.5 hover:bg-gray-50">
                  <div className="col-span-5 flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {s.first_name[0]}{s.last_name[0]}
                    </div>
                    <span className="text-sm text-gray-800 truncate">{s.first_name} {s.last_name}</span>
                  </div>
                  <div className="col-span-3 text-center">
                    {avg === null ? (
                      <span className="text-xs text-gray-300">—</span>
                    ) : (
                      <span className={`text-sm font-semibold ${avg >= 70 ? "text-green-600" : avg >= 50 ? "text-orange-600" : "text-red-600"}`}>
                        {avg.toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div className="col-span-4 flex items-center justify-end gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={maxScore}
                      value={scores[s.id] ?? ""}
                      onChange={(e) => setScores((p) => ({ ...p, [s.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveGrade(s); }}
                      placeholder={`/ ${maxScore}`}
                      className="w-16 text-sm px-2 py-1.5 rounded-lg border text-center focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                    <button
                      onClick={() => saveGrade(s)}
                      disabled={savingId === s.id || (scores[s.id] ?? "") === ""}
                      className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                        savedId === s.id ? "bg-green-100 text-green-700" : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {savedId === s.id ? "Saved" : savingId === s.id ? "..." : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent entries */}
      {grades.length > 0 && current && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Recent entries — {current.subject_name}</h3>
          <div className="space-y-1.5">
            {grades.slice(0, 6).map((g) => {
              const st = students.find((s) => s.id === g.student_id);
              const pct = (g.score / g.max_score) * 100;
              return (
                <div key={g.id} className="flex items-center justify-between text-sm bg-white border rounded-lg px-3 py-2">
                  <span className="text-gray-700">{st ? `${st.first_name} ${st.last_name}` : "Student"}</span>
                  <span className="text-xs text-gray-400">{g.exam_type} • {g.term}</span>
                  <span className={`font-semibold ${pct >= 70 ? "text-green-600" : pct >= 50 ? "text-orange-600" : "text-red-600"}`}>
                    {g.score}/{g.max_score}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Gradebook;
