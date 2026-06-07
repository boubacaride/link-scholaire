"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";
import { ContentType } from "@/types";

interface Assignment {
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
}

interface ContentItem {
  id: string;
  title: string;
  description: string | null;
  type: ContentType;
  due_date: string | null;
  is_published: boolean;
  file_urls: string[];
  class_id: string;
  subject_id: string;
  created_at: string;
}

const TYPE_META: Record<ContentType, { label: string; color: string; icon: string }> = {
  lesson: { label: "Lesson", color: "bg-blue-100 text-blue-700", icon: "📘" },
  assignment: { label: "Assignment", color: "bg-orange-100 text-orange-700", icon: "📝" },
  classwork: { label: "Classwork", color: "bg-purple-100 text-purple-700", icon: "🧩" },
};

/** Teacher lesson planning + resource library. Create lessons, assignments and
 *  shareable resources, then publish them to a class. */
const LessonPlanner = () => {
  const { user } = useAuth();
  const supabase = createClient();
  const { t } = useI18n();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<ContentType | "all">("all");

  // form state
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ContentType>("lesson");
  const [selected, setSelected] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [publish, setPublish] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!supabase || !user?.profileId) { setLoading(false); return; }
      const { data: cs } = await supabase
        .from("class_subjects")
        .select("class_id, subject_id, classes:class_id(name), subjects:subject_id(name)")
        .eq("teacher_id", user.profileId);
      const mapped: Assignment[] = (cs || []).map((c: any) => ({
        class_id: c.class_id,
        subject_id: c.subject_id,
        class_name: c.classes?.name || "Class",
        subject_name: c.subjects?.name || "Subject",
      }));
      setAssignments(mapped);
      if (mapped.length > 0) setSelected(`${mapped[0].class_id}|${mapped[0].subject_id}`);

      const { data: content } = await supabase
        .from("content")
        .select("id, title, description, type, due_date, is_published, file_urls, class_id, subject_id, created_at")
        .eq("teacher_id", user.profileId)
        .order("created_at", { ascending: false });
      setItems((content as ContentItem[]) || []);
      setLoading(false);
    };
    load();
  }, [user?.profileId]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setBody(""); setResourceUrl(""); setDueDate("");
    setType("lesson"); setPublish(true);
  };

  const create = async () => {
    if (!title.trim() || !selected || !supabase || !user?.profileId || !user?.schoolId) return;
    const [class_id, subject_id] = selected.split("|");
    setSaving(true);
    const { data, error } = await supabase
      .from("content")
      .insert({
        school_id: user.schoolId,
        class_id,
        subject_id,
        teacher_id: user.profileId,
        title: title.trim(),
        description: description.trim() || null,
        type,
        content_body: body.trim() || null,
        file_urls: resourceUrl.trim() ? [resourceUrl.trim()] : [],
        due_date: type !== "lesson" && dueDate ? new Date(dueDate).toISOString() : null,
        is_published: publish,
      })
      .select("id, title, description, type, due_date, is_published, file_urls, class_id, subject_id, created_at")
      .single();
    if (!error && data) {
      setItems((prev) => [data as ContentItem, ...prev]);
      resetForm();
      setShowForm(false);
    }
    setSaving(false);
  };

  const classLabel = (it: ContentItem) => {
    const a = assignments.find((x) => x.class_id === it.class_id && x.subject_id === it.subject_id);
    return a ? `${a.class_name} • ${a.subject_name}` : "";
  };

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.type === filter)),
    [items, filter]
  );

  if (loading) return <div className="p-6 text-center text-gray-400 text-sm">{t("wdg.loadingPlanner")}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5">
          {(["all", "lesson", "assignment", "classwork"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg capitalize transition-colors ${
                filter === f ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {f === "all" ? "All" : TYPE_META[f].label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); if (showForm) resetForm(); }}
          disabled={assignments.length === 0}
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-40"
        >
          {showForm ? "Cancel" : "+ New Resource"}
        </button>
      </div>

      {assignments.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-2">
          Assign yourself to a class to start planning lessons.
        </p>
      )}

      {showForm && (
        <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-wide">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Introduction to Fractions"
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-wide">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ContentType)}
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="lesson">{t("wdg.lesson")}</option>
                <option value="assignment">{t("wdg.assignment")}</option>
                <option value="classwork">{t("wdg.classwork")}</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-400 uppercase tracking-wide">Class &amp; Subject</label>
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
            {type !== "lesson" && (
              <div>
                <label className="text-[10px] text-gray-400 uppercase tracking-wide">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            )}
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary"
              className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide">Plan / Notes</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Lesson outline, objectives, instructions..."
              className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide">Resource Link (optional)</label>
            <input
              value={resourceUrl}
              onChange={(e) => setResourceUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              Publish to students
            </label>
            <button
              onClick={create}
              disabled={saving || !title.trim()}
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save Resource"}
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="p-8 text-center">
          <div className="text-4xl mb-2">📚</div>
          <p className="text-gray-500 text-sm">{t("wdg.noResources")}</p>
          <p className="text-gray-400 text-xs mt-1">{t("wdg.createMaterials")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((it) => {
            const meta = TYPE_META[it.type];
            return (
              <div key={it.id} className="flex items-start gap-3 border rounded-xl p-3 hover:shadow-sm transition-shadow">
                <div className="text-xl">{meta.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-800">{it.title}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.color}`}>{meta.label}</span>
                    {!it.is_published && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">{t("wdg.draft")}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{classLabel(it)}</p>
                  {it.description && <p className="text-xs text-gray-500 mt-1">{it.description}</p>}
                  <div className="flex items-center gap-3 mt-1">
                    {it.due_date && (
                      <span className="text-[11px] text-orange-600">Due {new Date(it.due_date).toLocaleDateString()}</span>
                    )}
                    {it.file_urls?.length > 0 && (
                      <a href={it.file_urls[0]} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline">
                        🔗 Resource
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LessonPlanner;
