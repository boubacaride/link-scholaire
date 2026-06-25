"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useEffect, useState } from "react";
import InputField from "../InputField";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";

const schema = z.object({
  title: z.string().min(1, { message: "Title is required!" }),
  description: z.string().min(1, { message: "Description is required!" }),
});

type Inputs = z.infer<typeof schema>;

interface ClassRow { id: string; name: string; grade: number }

/**
 * Announcements form. Per Task 3:
 *   • Admins can post school-wide (no audience rows) OR target one
 *     or more specific classes.
 *   • Teachers can only target classes they teach (RLS enforces this
 *     server-side too). They cannot post school-wide.
 *
 * Audience is stored in the new announcement_audiences junction
 * table; an empty audience set means "school-wide" (admin-only).
 */
const AnnouncementForm = ({ type, data }: { type: "create" | "update"; data?: any }) => {
  const { t } = useI18n();
  const { register, handleSubmit, formState: { errors } } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: { title: data?.title || "", description: data?.description || "" },
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const supabase = createClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "school_admin" || user?.role === "platform_admin";
  const isTeacher = user?.role === "teacher";

  // Class picker state.
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [schoolWide, setSchoolWide] = useState<boolean>(false);

  // Load the classes this user can target: admins see every class in
  // the school; teachers see only the ones they teach.
  useEffect(() => {
    if (!supabase || !user?.schoolId || !user?.profileId) return;
    (async () => {
      let rows: ClassRow[] = [];
      if (isAdmin) {
        const { data: cls } = await supabase
          .from("classes")
          .select("id, name, grade")
          .eq("school_id", user.schoolId)
          .order("grade", { ascending: true });
        rows = cls ?? [];
      } else if (isTeacher) {
        const { data: cs } = await supabase
          .from("class_subjects")
          .select("class_id, classes:class_id(id, name, grade)")
          .eq("teacher_id", user.profileId);
        type Row = { class_id: string; classes: ClassRow | null };
        rows = ((cs as unknown as Row[]) ?? [])
          .map((r) => r.classes)
          .filter((c): c is ClassRow => c !== null);
        // De-duplicate (a teacher may teach several subjects in one class).
        rows = Array.from(new Map(rows.map((c) => [c.id, c])).values());
      }
      setClasses(rows);

      // When editing, pre-load the existing audience selection.
      if (data?.id) {
        const { data: aud } = await supabase
          .from("announcement_audiences")
          .select("class_id")
          .eq("announcement_id", data.id);
        const ids = new Set((aud ?? []).map((a: { class_id: string }) => a.class_id));
        setSelected(ids);
        setSchoolWide(ids.size === 0);
      } else {
        // New post defaults: teacher → first class; admin → school-wide.
        if (isTeacher && rows.length > 0) setSelected(new Set([rows[0].id]));
        if (isAdmin) setSchoolWide(true);
      }
    })();
  }, [user?.profileId, user?.schoolId, data?.id]);

  const toggleClass = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setSchoolWide(false);
  };

  const onSubmit = handleSubmit(async (formData) => {
    if (!supabase || !user?.schoolId || !user?.profileId) return;
    setLoading(true);
    setMsg("");

    // Audience validation. Teachers MUST pick at least one class; only
    // admins can publish a school-wide (zero-audience) announcement.
    if (!schoolWide && selected.size === 0) {
      setMsg("Pick at least one class — or, for admins, tick School-wide.");
      setLoading(false);
      return;
    }
    if (schoolWide && !isAdmin) {
      setMsg("Only administrators can publish school-wide announcements.");
      setLoading(false);
      return;
    }

    try {
      let announcementId = data?.id;
      const payload = {
        title: formData.title,
        description: formData.description,
        school_id: user.schoolId,
        author_id: user.profileId,
      };

      if (type === "create") {
        const { data: inserted, error } = await supabase
          .from("announcements")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        announcementId = inserted.id;
      } else {
        const { error } = await supabase
          .from("announcements")
          .update({ title: payload.title, description: payload.description })
          .eq("id", announcementId);
        if (error) throw error;
      }

      // Replace the audience set in one shot. Safe for new + edit.
      await supabase
        .from("announcement_audiences")
        .delete()
        .eq("announcement_id", announcementId);
      if (!schoolWide && selected.size > 0) {
        const rows = Array.from(selected).map((classId) => ({
          announcement_id: announcementId,
          class_id: classId,
        }));
        const { error: audErr } = await supabase
          .from("announcement_audiences")
          .insert(rows);
        if (audErr) throw audErr;
      }

      setMsg(type === "create" ? "Announcement created!" : "Announcement updated!");
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: unknown) {
      setMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  });

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create"
          ? t("form.createTitle", { entity: t("form.entities.announcement") })
          : t("form.updateTitle", { entity: t("form.entities.announcement") })}
      </h1>

      <div className="flex justify-between flex-wrap gap-4">
        <InputField label={t("form.fields.title")} name="title" defaultValue={data?.title} register={register} error={errors?.title} />
      </div>
      <div>
        <label className="text-xs text-gray-500">{t("form.fields.description")}</label>
        <textarea
          rows={3}
          defaultValue={data?.description}
          {...register("description")}
          className="mt-1 w-full text-sm px-3 py-2 rounded-md ring-[1.5px] ring-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
        />
        {errors?.description && <p className="text-red-400 text-xs mt-1">{errors.description.message}</p>}
      </div>

      {/* Audience selector */}
      <div className="border border-gray-100 rounded-lg p-3 bg-gray-50/60">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
          Audience
        </p>

        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
            <input
              type="checkbox"
              checked={schoolWide}
              onChange={(e) => {
                setSchoolWide(e.target.checked);
                if (e.target.checked) setSelected(new Set());
              }}
            />
            <span>📣 School-wide (visible to every member)</span>
          </label>
        )}

        {!schoolWide && (
          <>
            <p className="text-xs text-gray-500 mb-2">
              {isTeacher
                ? "Tick the classes that should see this announcement. You can only target classes you teach."
                : "Tick one or more classes, or use the School-wide option above."}
            </p>
            {classes.length === 0 ? (
              <p className="text-xs text-gray-400">
                {isTeacher
                  ? "You're not assigned to any classes yet."
                  : "No classes available in this school."}
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                {classes.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-center gap-1.5 text-[12px] px-2 py-1 rounded-md border cursor-pointer transition-colors ${
                      selected.has(c.id)
                        ? "bg-blue-50 border-blue-300 text-blue-800"
                        : "bg-white border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-blue-600"
                      checked={selected.has(c.id)}
                      onChange={() => toggleClass(c.id)}
                    />
                    <span>{c.name} <span className="text-gray-400">(G{c.grade})</span></span>
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {msg && (
        <p className={`text-sm ${msg.startsWith("Error") || msg.startsWith("Pick") || msg.startsWith("Only") ? "text-red-500" : "text-green-600"}`}>
          {msg}
        </p>
      )}
      <button type="submit" disabled={loading} className="bg-blue-600 text-white p-2 rounded-md disabled:opacity-50 hover:bg-blue-700">
        {loading ? "Saving..." : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default AnnouncementForm;
