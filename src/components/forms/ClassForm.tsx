"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import InputField from "../InputField";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const schema = z.object({
  name: z.string().min(1, { message: "Class name is required!" }),
  capacity: z.string().min(1, { message: "Capacity is required!" }),
  grade: z.string().min(1, { message: "Grade level is required!" }),
});

type Inputs = z.infer<typeof schema>;

const ClassForm = ({ type, data }: { type: "create" | "update"; data?: any }) => {
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
      const payload = { name: formData.name, capacity: parseInt(formData.capacity), grade: formData.grade, school_id: user.schoolId };
      if (type === "create") {
        const { error } = await supabase.from("classes").insert(payload);
        if (error) throw error;
        setMsg("Class created!");
      } else {
        const { error } = await supabase.from("classes").update(payload).eq("id", data?.id);
        if (error) throw error;
        setMsg("Class updated!");
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
      <h1 className="text-xl font-semibold">{type === "create" ? "Create a new class" : "Update class"}</h1>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="Class Name" name="name" defaultValue={data?.name} register={register} error={errors?.name} />
        <InputField label="Capacity" name="capacity" defaultValue={data?.capacity} register={register} error={errors?.capacity} />
        <InputField label="Grade Level" name="grade" defaultValue={data?.grade} register={register} error={errors?.grade} />
      </div>
      {msg && <p className={`text-sm ${msg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{msg}</p>}
      <button type="submit" disabled={loading} className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50">
        {loading ? "Saving..." : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default ClassForm;
