"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect } from "react";
import InputField from "../InputField";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const schema = z.object({
  title: z.string().min(1, { message: "Title is required!" }),
  class_id: z.string().min(1, { message: "Class is required!" }),
  subject_id: z.string().min(1, { message: "Subject is required!" }),
  due_date: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;

const AssignmentForm = ({ type, data }: { type: "create" | "update"; data?: any }) => {
  const { register, handleSubmit, formState: { errors } } = useForm<Inputs>({ resolver: zodResolver(schema) });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [classes, setClasses] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const supabase = createClient();
  const { user } = useAuth();

  useEffect(() => {
    const fetch = async () => {
      if (!supabase) return;
      const [c, s] = await Promise.all([
        supabase.from("classes").select("id, name, grade").order("name"),
        supabase.from("subjects").select("id, name").order("name"),
      ]);
      if (c.data) setClasses(c.data);
      if (s.data) setSubjects(s.data);
    };
    fetch();
  }, []);

  const onSubmit = handleSubmit(async (formData) => {
    if (!supabase || !user?.schoolId) return;
    setLoading(true);
    setMsg("");
    try {
      const payload = { title: formData.title, class_id: formData.class_id, subject_id: formData.subject_id, due_date: formData.due_date || null, type: "assignment" as const, school_id: user.schoolId };
      if (type === "create") {
        const { error } = await supabase.from("content").insert(payload);
        if (error) throw error;
        setMsg("Assignment created!");
      } else {
        const { error } = await supabase.from("content").update(payload).eq("id", data?.id);
        if (error) throw error;
        setMsg("Assignment updated!");
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
      <h1 className="text-xl font-semibold">{type === "create" ? "Create a new assignment" : "Update assignment"}</h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="Title" name="title" defaultValue={data?.title} register={register} error={errors?.title} />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Class</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" {...register("class_id")} defaultValue={data?.class_id}>
            <option value="">Select Class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.grade})</option>)}
          </select>
          {errors.class_id?.message && <p className="text-xs text-red-400">{errors.class_id.message}</p>}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Subject</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" {...register("subject_id")} defaultValue={data?.subject_id}>
            <option value="">Select Subject</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {errors.subject_id?.message && <p className="text-xs text-red-400">{errors.subject_id.message}</p>}
        </div>
        <InputField label="Due Date" name="due_date" type="date" defaultValue={data?.due_date} register={register} error={errors?.due_date} />
      </div>
      {msg && <p className={`text-sm ${msg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{msg}</p>}
      <button type="submit" disabled={loading} className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50">
        {loading ? "Saving..." : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default AssignmentForm;
