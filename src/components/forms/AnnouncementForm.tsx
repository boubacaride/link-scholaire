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
  description: z.string().min(1, { message: "Description is required!" }),
  date: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;

const AnnouncementForm = ({ type, data }: { type: "create" | "update"; data?: any }) => {
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
      const payload = { title: formData.title, description: formData.description, date: formData.date || new Date().toISOString().split("T")[0], school_id: user.schoolId };
      if (type === "create") {
        const { error } = await supabase.from("announcements").insert(payload);
        if (error) throw error;
        setMsg("Announcement created!");
      } else {
        const { error } = await supabase.from("announcements").update(payload).eq("id", data?.id);
        if (error) throw error;
        setMsg("Announcement updated!");
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
      <h1 className="text-xl font-semibold">{type === "create" ? "Create a new announcement" : "Update announcement"}</h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="Title" name="title" defaultValue={data?.title} register={register} error={errors?.title} />
        <InputField label="Description" name="description" defaultValue={data?.description} register={register} error={errors?.description} />
        <InputField label="Date" name="date" type="date" defaultValue={data?.date} register={register} error={errors?.date} />
      </div>
      {msg && <p className={`text-sm ${msg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{msg}</p>}
      <button type="submit" disabled={loading} className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50">
        {loading ? "Saving..." : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default AnnouncementForm;
