"use client";

// Student + Parent view of documents issued to them (or their children) by
// the school: report cards, certificates, official letters, transcripts.
//
// RLS in migration 026 enforces the visibility rules — this page just
// queries and renders what the database returns.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

type Category = "report_card" | "certificate" | "letter" | "transcript" | "other";

interface DocRow {
  id: string;
  category: Category;
  title: string;
  description: string | null;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  term: string | null;
  academic_year: string | null;
  created_at: string;
  student_id: string;
  uploaded_by: string;
  student_name?: string;
  uploader_name?: string;
}

const CATEGORY_TONE: Record<Category, string> = {
  report_card: "bg-emerald-50 text-emerald-700 border-emerald-200",
  certificate: "bg-purple-50 text-purple-700 border-purple-200",
  letter:      "bg-blue-50 text-blue-700 border-blue-200",
  transcript:  "bg-amber-50 text-amber-700 border-amber-200",
  other:       "bg-gray-50 text-gray-700 border-gray-200",
};

const formatBytes = (n: number | null) => {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const MyDocumentsPage = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category | "all">("all");

  const isParent = user?.role === "parent";

  useEffect(() => {
    const load = async () => {
      if (!supabase || !user) { setLoading(false); return; }

      const { data, error } = await supabase
        .from("student_documents")
        .select("id, category, title, description, storage_path, file_name, file_size, term, academic_year, created_at, student_id, uploaded_by")
        .order("created_at", { ascending: false });
      if (error || !data) { setDocs([]); setLoading(false); return; }

      // Hydrate student + uploader names for the parent view (a parent can have
      // multiple children, so each row needs the child label).
      const studentIds = Array.from(new Set(data.map((d) => d.student_id)));
      const uploaderIds = Array.from(new Set(data.map((d) => d.uploaded_by)));
      const ids = Array.from(new Set([...studentIds, ...uploaderIds]));
      let names = new Map<string, string>();
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", ids);
        names = new Map((profiles || []).map((p: any) =>
          [p.id, `${p.first_name} ${p.last_name}`.trim()],
        ));
      }
      setDocs(data.map((d) => ({
        ...d,
        student_name: names.get(d.student_id) || "",
        uploader_name: names.get(d.uploaded_by) || "",
      })));
      setLoading(false);
    };
    load();
  }, [user?.profileId]);

  const filtered = useMemo(
    () => (filter === "all" ? docs : docs.filter((d) => d.category === filter)),
    [docs, filter],
  );

  const download = async (d: DocRow) => {
    if (!supabase) return;
    const { data, error } = await supabase.storage
      .from("student-documents")
      .createSignedUrl(d.storage_path, 60 * 60);
    if (error || !data?.signedUrl) return;
    // Force download via a temporary anchor with the original filename.
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = d.file_name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="bg-white rounded-xl border shadow-sm p-5">
        <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">
              {isParent ? t("docs.childDocuments") : t("docs.myDocuments")}
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {t("docs.emptyHint")}
            </p>
          </div>
          {/* Category filter chips */}
          <div className="flex gap-1.5 flex-wrap">
            {(["all", "report_card", "certificate", "letter", "transcript", "other"] as const).map((c) => (
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
          <div className="text-sm text-gray-400 text-center py-10">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10">
            <div className="text-4xl mb-2">📄</div>
            <p className="text-sm text-gray-500">{t("docs.empty")}</p>
            <p className="text-xs text-gray-400 mt-1">{t("docs.emptyHint")}</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((d) => (
              <div key={d.id} className="border rounded-xl p-4 hover:shadow-sm transition-shadow flex flex-col">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${CATEGORY_TONE[d.category]}`}>
                    {t(`docs.categories.${d.category}`)}
                  </span>
                  {d.term && <span className="text-[10px] text-gray-400">• {d.term}</span>}
                  {d.academic_year && <span className="text-[10px] text-gray-400">• {d.academic_year}</span>}
                </div>
                <p className="text-sm font-semibold text-gray-800">{d.title}</p>
                {isParent && d.student_name && (
                  <p className="text-[11px] text-gray-500 mt-0.5">👤 {d.student_name}</p>
                )}
                {d.description && (
                  <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{d.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400">
                  <span>{t("docs.uploadedOn")} {new Date(d.created_at).toLocaleDateString()}</span>
                  <span>{formatBytes(d.file_size)}</span>
                </div>
                <button
                  onClick={() => download(d)}
                  className="mt-3 self-start inline-flex items-center gap-1.5 text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 font-medium"
                >
                  ⬇ {t("docs.download")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyDocumentsPage;
