"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/contexts/LanguageContext";
import { ContentType } from "@/types";
import RichTextEditor from "@/components/RichTextEditor";
import FileAttachments, { AttachedFile } from "@/components/FileAttachments";
import SlidesAttachment from "@/components/SlidesAttachment";
import ReminderComposer from "@/components/dashboard/ReminderComposer";

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
  slides_url: string | null;
  content_body: string | null;
  class_id: string;
  subject_id: string;
  created_at: string;
}

const TYPE_META: Record<ContentType, { label: string; color: string; icon: string }> = {
  lesson:     { label: "Lesson",     color: "bg-blue-100 text-blue-700",   icon: "📘" },
  assignment: { label: "Assignment", color: "bg-orange-100 text-orange-700", icon: "📝" },
  classwork:  { label: "Classwork",  color: "bg-purple-100 text-purple-700", icon: "🧩" },
};

const SUB_TABS: { id: ContentType | "all"; label: string; icon: string }[] = [
  { id: "all",        label: "All",        icon: "📂" },
  { id: "lesson",     label: "Lesson",     icon: "📘" },
  { id: "assignment", label: "Assignment", icon: "📝" },
  { id: "classwork",  label: "Classwork",  icon: "🧩" },
];

/** file_urls is stored as TEXT[] in Postgres — we encode each entry as
 *  `<name>|<size>|<url>` so we can rebuild the original file list when
 *  the planner reloads. Legacy rows that contain only a URL still work. */
const encodeFile = (f: AttachedFile) => `${f.name}|${f.size}|${f.url}`;
const decodeFile = (s: string): AttachedFile => {
  const parts = s.split("|");
  if (parts.length >= 3) {
    const url = parts.slice(2).join("|");
    return { name: parts[0], size: Number(parts[1]) || 0, url };
  }
  return { name: s.split("/").pop() || "Resource", size: 0, url: s };
};

/** Teacher lesson planning + resource library. Create lessons, assignments
 *  and shareable resources with rich-text bodies, multi-file attachments,
 *  and an optional slide deck, then publish them to a class. */
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reminderFor, setReminderFor] = useState<ContentItem | null>(null);

  // form state
  const [type, setType] = useState<ContentType>("lesson");
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [slidesUrl, setSlidesUrl] = useState<string | null>(null);
  const [slidesName, setSlidesName] = useState<string | null>(null);
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
        .select("id, title, description, type, due_date, is_published, file_urls, slides_url, content_body, class_id, subject_id, created_at")
        .eq("teacher_id", user.profileId)
        .order("created_at", { ascending: false });
      setItems((content as ContentItem[]) || []);
      setLoading(false);
    };
    load();
  }, [user?.profileId]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setBody(""); setDueDate("");
    setFiles([]); setSlidesUrl(null); setSlidesName(null);
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
        file_urls: files.map(encodeFile),
        slides_url: type === "lesson" ? slidesUrl : null,
        due_date: type !== "lesson" && dueDate ? new Date(dueDate).toISOString() : null,
        is_published: publish,
      })
      .select("id, title, description, type, due_date, is_published, file_urls, slides_url, content_body, class_id, subject_id, created_at")
      .single();
    if (!error && data) {
      setItems((prev) => [data as ContentItem, ...prev]);
      resetForm();
      setShowForm(false);
    }
    setSaving(false);
  };

  const togglePublish = async (it: ContentItem) => {
    if (!supabase) return;
    const { error } = await supabase
      .from("content")
      .update({ is_published: !it.is_published })
      .eq("id", it.id);
    if (!error) setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, is_published: !p.is_published } : p)));
  };

  const remove = async (it: ContentItem) => {
    if (!supabase) return;
    if (!window.confirm(`Delete "${it.title}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("content").delete().eq("id", it.id);
    if (!error) setItems((prev) => prev.filter((p) => p.id !== it.id));
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
      {/* Sub-tab strip — mirrors the requested Lesson / Assignment / Classwork tabs */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-100">
          {SUB_TABS.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setFilter(tb.id)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                filter === tb.id ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span>{tb.icon}</span>{tb.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setReminderFor({} as ContentItem)}
            disabled={assignments.length === 0}
            className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-amber-600 transition-colors disabled:opacity-40"
          >
            🔔 Send Reminder
          </button>
          <button
            onClick={() => {
              setShowForm((v) => !v);
              if (showForm) resetForm();
              else if (filter !== "all") setType(filter);
            }}
            disabled={assignments.length === 0}
            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-40"
          >
            {showForm ? "Cancel" : "+ New Resource"}
          </button>
        </div>
      </div>

      {assignments.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-2">
          Assign yourself to a class to start planning lessons.
        </p>
      )}

      {showForm && (
        <div className="border rounded-2xl p-5 space-y-4 bg-gradient-to-br from-slate-50 to-blue-50/40">
          {/* Type selector */}
          <div className="flex gap-2 flex-wrap">
            {(["lesson", "assignment", "classwork"] as ContentType[]).map((tType) => {
              const meta = TYPE_META[tType];
              const active = type === tType;
              return (
                <button
                  key={tType}
                  onClick={() => setType(tType)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-all ${
                    active ? `${meta.color} border-current shadow-sm` : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <span>{meta.icon}</span>{meta.label}
                </button>
              );
            })}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-[10px] text-gray-400 uppercase tracking-wide">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={type === "lesson" ? "Introduction to Fractions" : type === "assignment" ? "Algebra Worksheet #3" : "In-class problem set"}
                className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
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
            <label className="text-[10px] text-gray-400 uppercase tracking-wide">Short summary</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One-line summary shown in the resource list"
              className="mt-1 w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Rich text body */}
          <div>
            <label className="text-[10px] text-gray-400 uppercase tracking-wide block mb-1">
              {type === "lesson" ? "Lesson content" : type === "assignment" ? "Assignment instructions" : "Classwork instructions"}
            </label>
            <RichTextEditor
              value={body}
              onChange={setBody}
              placeholder={
                type === "lesson"
                  ? "Write the lesson plan — objectives, outline, examples..."
                  : "Describe the work, expectations, grading criteria..."
              }
            />
          </div>

          {/* Slide deck slot (lesson only) */}
          {type === "lesson" && (
            <SlidesAttachment
              value={slidesUrl}
              fileName={slidesName}
              onChange={(u, n) => { setSlidesUrl(u); setSlidesName(n); }}
            />
          )}

          {/* Generic file attachments */}
          <FileAttachments
            value={files}
            onChange={setFiles}
            folder={type}
            label={`${TYPE_META[type].label} attachments — any file type`}
          />

          <div className="flex items-center justify-between pt-1">
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
            const isOpen = expandedId === it.id;
            const fileList = (it.file_urls || []).map(decodeFile);
            return (
              <div key={it.id} className="border rounded-xl hover:shadow-sm transition-shadow bg-white">
                <div className="flex items-start gap-3 p-3">
                  <div className="text-xl">{meta.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-800">{it.title}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.color}`}>{meta.label}</span>
                      {!it.is_published && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">{t("wdg.draft")}</span>
                      )}
                      {it.slides_url && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">📊 Slides</span>
                      )}
                      {fileList.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-600">
                          📎 {fileList.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{classLabel(it)}</p>
                    {it.description && <p className="text-xs text-gray-500 mt-1">{it.description}</p>}
                    {it.due_date && (
                      <span className="text-[11px] text-orange-600 mt-1 inline-block">
                        Due {new Date(it.due_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {(it.type === "assignment" || it.type === "classwork") && (
                      <button
                        onClick={() => setReminderFor(it)}
                        className="text-[11px] text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-md font-medium"
                        title="Send reminder"
                      >
                        🔔 Remind
                      </button>
                    )}
                    <button
                      onClick={() => setExpandedId(isOpen ? null : it.id)}
                      className="text-[11px] text-gray-500 hover:bg-gray-100 px-2 py-1 rounded-md font-medium"
                    >
                      {isOpen ? "Hide" : "View"}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t px-4 py-3 space-y-3 bg-gray-50/50">
                    {it.content_body && (
                      <div
                        className="rte-content text-sm text-gray-700"
                        dangerouslySetInnerHTML={{ __html: it.content_body }}
                      />
                    )}

                    {it.slides_url && (
                      <div className="bg-white rounded-lg border overflow-hidden">
                        <div className="px-3 py-2 bg-orange-50 border-b text-xs font-medium text-orange-800">📊 Slide deck</div>
                        <iframe
                          title={`${it.title} slides`}
                          src={it.slides_url.toLowerCase().endsWith(".pdf")
                            ? it.slides_url
                            : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(it.slides_url)}`}
                          className="w-full"
                          style={{ height: 360 }}
                          allow="fullscreen"
                        />
                      </div>
                    )}

                    {fileList.length > 0 && (
                      <div className="bg-white rounded-lg border p-2.5">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Attachments</p>
                        <ul className="space-y-1">
                          {fileList.map((f, i) => (
                            <li key={i}>
                              <a
                                href={f.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1.5"
                              >
                                📎 {f.name}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => togglePublish(it)}
                        className="text-[11px] bg-white border border-gray-200 text-gray-700 px-3 py-1 rounded-md hover:bg-gray-100"
                      >
                        {it.is_published ? "Unpublish" : "Publish"}
                      </button>
                      <button
                        onClick={() => remove(it)}
                        className="text-[11px] bg-white border border-red-200 text-red-600 px-3 py-1 rounded-md hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {reminderFor !== null && (
        <ReminderComposer
          defaultClassId={reminderFor.class_id}
          defaultSubject={reminderFor.title}
          defaultType={reminderFor.type === "assignment" ? "homework" : reminderFor.type === "classwork" ? "homework" : "general"}
          defaultDueAt={reminderFor.due_date ? reminderFor.due_date.slice(0, 16) : undefined}
          onClose={() => setReminderFor(null)}
        />
      )}
    </div>
  );
};

export default LessonPlanner;
