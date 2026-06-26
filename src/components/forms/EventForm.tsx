"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import InputField from "../InputField";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";

// Date + HH:MM time fields are paired in the UI and combined into a
// single ISO timestamp on save. The end fields default to the start
// values so quick one-off events don't need both filled in.
const schema = z.object({
  title: z.string().min(1, { message: "Title is required!" }),
  description: z.string().optional(),
  start_date: z.string().min(1, { message: "Start date is required!" }),
  start_time: z.string().optional(),
  end_date: z.string().optional(),
  end_time: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;

// Combine "YYYY-MM-DD" + "HH:MM" into an ISO datetime. Time defaults to
// midnight when blank; that keeps the legacy date-only behaviour for
// events created before the time fields existed.
const combineDateTime = (date: string, time?: string): string => {
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : "00:00";
  // No timezone suffix — Postgres will interpret as the session's
  // configured TZ, matching how legacy rows were stored.
  return `${date}T${t}:00`;
};

// Pull date + HH:MM back out of an ISO timestamp for edit defaults.
const splitDateTime = (iso?: string): { date: string; time: string } => {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: iso.slice(0, 10), time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};

const EventForm = ({ type, data }: { type: "create" | "update"; data?: any }) => {
  const { t } = useI18n();
  const { register, handleSubmit, formState: { errors } } = useForm<Inputs>({ resolver: zodResolver(schema) });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const supabase = createClient();
  const { user } = useAuth();

  const startDefaults = splitDateTime(data?.start_date);
  const endDefaults   = splitDateTime(data?.end_date);

  const onSubmit = handleSubmit(async (formData) => {
    if (!supabase || !user?.schoolId) return;
    setLoading(true);
    setMsg("");
    try {
      const startISO = combineDateTime(formData.start_date, formData.start_time);
      const endDate  = formData.end_date || formData.start_date;
      const endTime  = formData.end_time || formData.start_time;
      const endISO   = combineDateTime(endDate, endTime);

      const payload = {
        title: formData.title,
        description: formData.description || null,
        start_date: startISO,
        end_date: endISO,
        school_id: user.schoolId,
      };
      if (type === "create") {
        const { error } = await supabase.from("events").insert(payload);
        if (error) throw error;
        setMsg("Event created!");
      } else {
        const { error } = await supabase.from("events").update(payload).eq("id", data?.id);
        if (error) throw error;
        setMsg("Event updated!");
      }
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  });

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">{type === "create" ? t("form.createTitle", { entity: t("form.entities.event") }) : t("form.updateTitle", { entity: t("form.entities.event") })}</h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField label={t("form.fields.title")} name="title" defaultValue={data?.title} register={register} error={errors?.title} />
        <InputField label={t("form.fields.description")} name="description" defaultValue={data?.description} register={register} error={errors?.description} />
        <InputField label={t("form.fields.startDate")} name="start_date" type="date" defaultValue={startDefaults.date} register={register} error={errors?.start_date} />
        <InputField label="Start time" name="start_time" type="time" defaultValue={startDefaults.time} register={register} error={errors?.start_time} />
        <InputField label={t("form.fields.endDate")} name="end_date" type="date" defaultValue={endDefaults.date} register={register} error={errors?.end_date} />
        <InputField label="End time" name="end_time" type="time" defaultValue={endDefaults.time} register={register} error={errors?.end_time} />
      </div>
      {msg && <p className={`text-sm ${msg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{msg}</p>}
      <button type="submit" disabled={loading} className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50">
        {loading ? "Saving..." : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default EventForm;
