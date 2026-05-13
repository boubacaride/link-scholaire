"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import InputField from "../InputField";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const schema = z.object({
  title: z.string().min(1, { message: "Title is required!" }),
  description: z.string().optional(),
  start_date: z.string().min(1, { message: "Start date is required!" }),
  end_date: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;

const EventForm = ({ type, data }: { type: "create" | "update"; data?: any }) => {
  const { register, handleSubmit, formState: { errors } } = useForm<Inputs>({ resolver: zodResolver(schema) });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const supabase = createClient();
  const { user } = useAuth();

  const onSubmit = handleSubmit(async (formData) => {
    if (!supabase || !user?.schoolId) return;
    setLoading(true);
    setMsg("");
    try {
      const payload = { title: formData.title, description: formData.description || null, start_date: formData.start_date, end_date: formData.end_date || formData.start_date, school_id: user.schoolId };
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
      <h1 className="text-xl font-semibold">{type === "create" ? "Create a new event" : "Update event"}</h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="Title" name="title" defaultValue={data?.title} register={register} error={errors?.title} />
        <InputField label="Description" name="description" defaultValue={data?.description} register={register} error={errors?.description} />
        <InputField label="Start Date" name="start_date" type="date" defaultValue={data?.start_date} register={register} error={errors?.start_date} />
        <InputField label="End Date" name="end_date" type="date" defaultValue={data?.end_date} register={register} error={errors?.end_date} />
      </div>
      {msg && <p className={`text-sm ${msg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{msg}</p>}
      <button type="submit" disabled={loading} className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50">
        {loading ? "Saving..." : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default EventForm;
