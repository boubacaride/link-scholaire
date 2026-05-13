"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect } from "react";
import InputField from "../InputField";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const schema = z.object({
  student_id: z.string().min(1, { message: "Student is required!" }),
  subject_id: z.string().min(1, { message: "Subject is required!" }),
  class_id: z.string().min(1, { message: "Class is required!" }),
  score: z.string().min(1, { message: "Score is required!" }),
  max_score: z.string().min(1, { message: "Max score is required!" }),
  exam_type: z.string().min(1, { message: "Exam type is required!" }),
  term: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;

const ResultForm = ({ type, data }: { type: "create" | "update"; data?: any }) => {
  const { register, handleSubmit, formState: { errors } } = useForm<Inputs>({ resolver: zodResolver(schema) });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const supabase = createClient();
  const { user } = useAuth();

  useEffect(() => {
    const fetch = async () => {
      if (!supabase) return;
      const [st, su, cl] = await Promise.all([
        supabase.from("profiles").select("id, first_name, last_name").eq("role", "student").order("first_name"),
        supabase.from("subjects").select("id, name").order("name"),
        supabase.from("classes").select("id, name, grade").order("name"),
      ]);
      if (st.data) setStudents(st.data);
      if (su.data) setSubjects(su.data);
      if (cl.data) setClasses(cl.data);
    };
    fetch();
  }, []);

  const onSubmit = handleSubmit(async (formData) => {
    if (!supabase || !user?.schoolId) return;
    setLoading(true);
    setMsg("");
    try {
      const payload = {
        student_id: formData.student_id,
        subject_id: formData.subject_id,
        class_id: formData.class_id,
        score: parseFloat(formData.score),
        max_score: parseFloat(formData.max_score),
        exam_type: formData.exam_type,
        term: formData.term || null,
        academic_year: new Date().getFullYear().toString(),
        school_id: user.schoolId,
        recorded_by: user.profileId,
      };
      if (type === "create") {
        const { error } = await supabase.from("grades").insert(payload);
        if (error) throw error;
        setMsg("Result recorded!");
      } else {
        const { error } = await supabase.from("grades").update(payload).eq("id", data?.id);
        if (error) throw error;
        setMsg("Result updated!");
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
      <h1 className="text-xl font-semibold">{type === "create" ? "Record a new result" : "Update result"}</h1>
      <div className="flex justify-between flex-wrap gap-4">
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Student</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" {...register("student_id")} defaultValue={data?.student_id}>
            <option value="">Select Student</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>)}
          </select>
          {errors.student_id?.message && <p className="text-xs text-red-400">{errors.student_id.message}</p>}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Subject</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" {...register("subject_id")} defaultValue={data?.subject_id}>
            <option value="">Select Subject</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {errors.subject_id?.message && <p className="text-xs text-red-400">{errors.subject_id.message}</p>}
        </div>
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Class</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" {...register("class_id")} defaultValue={data?.class_id}>
            <option value="">Select Class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.grade})</option>)}
          </select>
          {errors.class_id?.message && <p className="text-xs text-red-400">{errors.class_id.message}</p>}
        </div>
        <InputField label="Score" name="score" defaultValue={data?.score} register={register} error={errors?.score} />
        <InputField label="Max Score" name="max_score" defaultValue={data?.max_score || "100"} register={register} error={errors?.max_score} />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Exam Type</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" {...register("exam_type")} defaultValue={data?.exam_type}>
            <option value="">Select Type</option>
            <option value="quiz">Quiz</option>
            <option value="midterm">Midterm</option>
            <option value="final">Final</option>
            <option value="homework">Homework</option>
            <option value="project">Project</option>
          </select>
          {errors.exam_type?.message && <p className="text-xs text-red-400">{errors.exam_type.message}</p>}
        </div>
        <InputField label="Term" name="term" defaultValue={data?.term} register={register} error={errors?.term} />
      </div>
      {msg && <p className={`text-sm ${msg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{msg}</p>}
      <button type="submit" disabled={loading} className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50">
        {loading ? "Saving..." : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default ResultForm;
