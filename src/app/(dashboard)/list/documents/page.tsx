"use client";

// Teacher / admin page for issuing documents to students (report cards,
// certificates, official letters, transcripts). The student / parent side
// renders the same rows at /list/my-documents.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

type Category = "report_card" | "certificate" | "letter" | "transcript" | "other";

interface StudentOption {
  id: string;
  name: string;
  class_name?: string;
}

interface DocRow {
  id: string;
  student_id: string;
  student_name: string;
  category: Category;
  title: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  created_at: string;
}

const CATEGORIES: Category[] = ["report_card", "certificate", "letter", "transcript", "other"];

const fmtBytes = (n: number | null) => {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const DocumentsAdminPage = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();

  const canUpload = user?.role === "teacher" || user?.role === "school_admin" || user?.role === "platform_admin";

  const [students, setStudents] = useState<StudentOption[]>([]);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category | "all">("all");

  // Upload form state
  const [studentId, setStudentId] = useState("");
  const [category, setCategory] = useState<Category>("report_card");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [term, setTerm] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!supabase || !user) { setLoading(false); return; }

      // Students of the same school for the picker.
      const { data: ss } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("school_id", user.schoolId)
        .eq("role", "student")
        .order("last_name", { ascending: true });
      setStudents((ss || []).map((s: any) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name}`.trim(),
      })));

      // Documents
      const { data } = await supabase
        .from("student_documents")
        .select("id, student_id, category, title, storage_path, file_name, file_size, created_at")
        .order("created_at", { ascending: false });
      const studentIds = Array.from(new Set((data || []).map((d: any) => d.student_id)));
      let names = new Map<string, string>();
      if (studentIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", studentIds);
        names = new Map((profiles || []).map((p: any) =>
          [p.id, `${p.first_name} ${p.last_name}`.trim()],
        ));
      }
      setDocs((data || []).map((d: any) => ({
        ...d,
        student_name: names.get(d.student_id) || "",
      })));
      setLoading(false);
    };
    load();
  }, [user?.profileId]);

  const filtered = useMemo(
    () => (filter === "all" ? docs : docs.filter((d) => d.category === filter)),
    [docs, filter],
  );

  const resetForm = () => {
    setStudentId(""); setCategory("report_card"); setTitle("");
    setDescription(""); setTerm(""); setAcademicYear(""); setFile(null);
    setErr(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !user) return;
    if (!studentId || !title.trim() || !file) {
      setErr("Pick a student, write a title, and attach a file.");
      return;
    }
    setBusy(true);
    setErr(null);
    setDone(false);

    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.schoolId}/${studentId}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("student-documents")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const { data: row, error: insErr } = await supabase
        .from("student_documents")
        .insert({
          school_id: user.schoolId,
          student_id: studentId,
          uploaded_by: user.profileId,
          category,
          title: title.trim(),
          description: description.trim() || null,
          storage_path: path,
          file_name: file.name,
          file_size: file.size,
          term: term.trim() || null,
          academic_year: academicYear.trim() || null,
        })
        .select("id, student_id, category, title, storage_path, file_name, file_size, created_at")
        .single();
      if (insErr) throw insErr;

      const studentName = students.find((s) => s.id === studentId)?.name || "";
      setDocs((p) => [{ ...(row as DocRow), student_name: studentName }, ...p]);
      setDone(true);
      resetForm();
      setTimeout(() => setDone(false), 2500);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async (d: DocRow) => {
    if (!supabase) return;
    const { data } = await supabase.storage
      .from("student-documents")
      .createSignedUrl(d.storage_path, 60 * 60);
    if (!data?.signedUrl) return;
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = d.file_name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const remove = async (d: DocRow) => {
    if (!supabase) return;
    if (!window.confirm(t("docs.confirmDelete"))) return;
    await supabase.storage.from("student-documents").remove([d.storage_path]);
    await supabase.from("student_documents").delete().eq("id", d.id);
    setDocs((p) => p.filter((x) => x.id !== d.id));
  };

  if (!canUpload) {
    return (
      <div className="p-4">
        <div className="bg-white rounded-xl border shadow-sm p-6 text-center">
          <p className="text-sm text-gray-500">Only teachers and admins can manage documents.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      {/* Upload */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-800 mb-3">{t("docs.uploadTitle")}</h2>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-[11px] text-gray-500">{t("docs.pickStudent")}</label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="" disabled>—</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500">{t("docs.pickCategory")}</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{t(`docs.categories.${c}`)}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] text-gray-500">{t("docs.title")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={category === "report_card" ? "Q1 Report Card" : "Document title"}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] text-gray-500">{t("docs.description")}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500">{t("docs.term")}</label>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Q1"
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500">{t("docs.academicYear")}</label>
            <input
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              placeholder="2025-2026"
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] text-gray-500">{t("docs.file")}</label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              required
              className="mt-1 w-full text-sm px-3 py-2 rounded-md border border-gray-300 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-blue-50 file:text-blue-700"
            />
          </div>
          {err && <p className="md:col-span-2 text-xs text-red-600 bg-red-50 rounded px-3 py-2">{err}</p>}
          {done && <p className="md:col-span-2 text-xs text-green-700 bg-green-50 rounded px-3 py-2">✓</p>}
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? t("docs.uploading") : t("docs.upload")}
            </button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-base font-semibold text-gray-800">{t("docs.myDocuments")}</h2>
          <div className="flex gap-1.5 flex-wrap">
            {(["all", ...CATEGORIES] as const).map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  filter === c
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {c === "all" ? t("docs.allCategories") : t(`docs.categories.${c}`)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-gray-400 text-center py-6">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-gray-400 text-center py-6">{t("docs.empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-gray-400 border-b">
                <tr>
                  <th className="text-left py-2">{t("docs.title")}</th>
                  <th className="text-left py-2">{t("docs.pickStudent")}</th>
                  <th className="text-left py-2">{t("docs.pickCategory")}</th>
                  <th className="text-left py-2">{t("docs.uploadedOn")}</th>
                  <th className="text-right py-2">{t("ui.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="border-b hover:bg-gray-50">
                    <td className="py-2.5">
                      <div className="font-medium text-gray-800">{d.title}</div>
                      <div className="text-[11px] text-gray-400">{d.file_name} · {fmtBytes(d.file_size)}</div>
                    </td>
                    <td className="py-2.5 text-gray-700">{d.student_name}</td>
                    <td className="py-2.5">
                      <span className="text-[11px] text-gray-600">{t(`docs.categories.${d.category}`)}</span>
                    </td>
                    <td className="py-2.5 text-[11px] text-gray-500">
                      {new Date(d.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() => download(d)}
                          className="text-[11px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded hover:bg-blue-100"
                        >
                          {t("docs.download")}
                        </button>
                        <button
                          onClick={() => remove(d)}
                          className="text-[11px] bg-red-50 text-red-700 px-2.5 py-1 rounded hover:bg-red-100"
                        >
                          {t("docs.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentsAdminPage;
