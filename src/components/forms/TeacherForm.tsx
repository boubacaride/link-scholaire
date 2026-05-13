"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect } from "react";
import InputField from "../InputField";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const schema = z.object({
  username: z.string().min(3, { message: "Username must be at least 3 characters long!" }).max(20),
  email: z.string().email({ message: "Invalid email address!" }),
  password: z.string().min(1, { message: "Password is required!" }),
  firstName: z.string().min(1, { message: "First name is required!" }),
  lastName: z.string().min(1, { message: "Last name is required!" }),
  phone: z.string().optional(),
  address: z.string().optional(),
  bloodType: z.string().optional(),
  birthday: z.string().optional(),
  sex: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;

interface ClassOption { id: string; name: string; grade: string; }
interface SubjectOption { id: string; name: string; }
interface Assignment { class_id: string; subject_id: string; }

const TeacherForm = ({ type, data }: { type: "create" | "update"; data?: any }) => {
  const { register, handleSubmit, formState: { errors } } = useForm<Inputs>({ resolver: zodResolver(schema) });
  const supabase = createClient();
  const { user } = useAuth();

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");

  // Fetch classes and subjects
  useEffect(() => {
    const fetchData = async () => {
      if (!supabase) return;
      const [classRes, subjectRes] = await Promise.all([
        supabase.from("classes").select("id, name, grade").order("name"),
        supabase.from("subjects").select("id, name").order("name"),
      ]);
      if (classRes.data) setClasses(classRes.data);
      if (subjectRes.data) setSubjects(subjectRes.data);
    };
    fetchData();
  }, []);

  // If editing, load current assignments
  useEffect(() => {
    const fetchAssignments = async () => {
      if (!supabase || !data?.id) return;
      const { data: existing } = await supabase
        .from("class_subjects")
        .select("class_id, subject_id")
        .eq("teacher_id", data.id);
      if (existing) setAssignments(existing);
    };
    if (type === "update" && data?.id) fetchAssignments();
  }, [data?.id, type]);

  const addAssignment = () => {
    setAssignments([...assignments, { class_id: "", subject_id: "" }]);
  };

  const removeAssignment = (idx: number) => {
    setAssignments(assignments.filter((_, i) => i !== idx));
  };

  const updateAssignment = (idx: number, field: "class_id" | "subject_id", value: string) => {
    const updated = [...assignments];
    updated[idx] = { ...updated[idx], [field]: value };
    setAssignments(updated);
  };

  const onSubmit = handleSubmit(async (formData) => {
    if (!supabase || !user?.schoolId) return;
    setLoading(true);
    setSubmitMsg("");
    try {
      let teacherId = data?.id;

      if (type === "create") {
        if (!formData.email || !formData.password) throw new Error("Email and password are required");
        const { data: result, error } = await supabase.rpc("create_user_with_profile", {
          p_email: formData.email,
          p_password: formData.password,
          p_role: "teacher",
          p_first_name: formData.firstName,
          p_last_name: formData.lastName,
          p_phone: formData.phone || null,
          p_address: formData.address || null,
        });
        if (error) throw error;
        if (!result || result.error) throw new Error(result?.error || "Failed to create user");
        teacherId = result.profile_id;
        if (!teacherId) throw new Error("No profile ID returned");
      } else {
        const { error } = await supabase
          .from("profiles")
          .update({
            first_name: formData.firstName,
            last_name: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
          })
          .eq("id", teacherId);
        if (error) throw error;
      }

      // Sync class_subjects
      if (teacherId) {
        // Delete existing assignments for this teacher
        const { error: delError } = await supabase.from("class_subjects").delete().eq("teacher_id", teacherId);
        if (delError) console.warn("Delete class_subjects:", delError.message);

        const validAssignments = assignments.filter((a) => a.class_id && a.subject_id);
        if (validAssignments.length > 0) {
          // Deduplicate by class_id+subject_id
          const seen = new Set<string>();
          const uniqueRows = validAssignments.filter((a) => {
            const key = `${a.class_id}-${a.subject_id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          const rows = uniqueRows.map((a) => ({
            teacher_id: teacherId,
            class_id: a.class_id,
            subject_id: a.subject_id,
          }));
          const { error } = await supabase.from("class_subjects").upsert(rows, {
            onConflict: "class_id,subject_id",
          });
          if (error) throw error;
        }
      }

      setSubmitMsg(type === "create" ? "Teacher created!" : "Teacher updated!");
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      setSubmitMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  });

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new teacher" : "Update teacher"}
      </h1>
      <span className="text-xs text-gray-400 font-medium">Authentication Information</span>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="Username" name="username" defaultValue={data?.username} register={register} error={errors?.username} />
        <InputField label="Email" name="email" defaultValue={data?.email} register={register} error={errors?.email} />
        <InputField label="Password" name="password" type="password" defaultValue={data?.password} register={register} error={errors?.password} />
      </div>
      <span className="text-xs text-gray-400 font-medium">Personal Information</span>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="First Name" name="firstName" defaultValue={data?.firstName || data?.first_name} register={register} error={errors.firstName} />
        <InputField label="Last Name" name="lastName" defaultValue={data?.lastName || data?.last_name} register={register} error={errors.lastName} />
        <InputField label="Phone" name="phone" defaultValue={data?.phone} register={register} error={errors.phone} />
        <InputField label="Address" name="address" defaultValue={data?.address} register={register} error={errors.address} />
        <InputField label="Blood Type" name="bloodType" defaultValue={data?.bloodType} register={register} error={errors.bloodType} />
        <InputField label="Birthday" name="birthday" defaultValue={data?.birthday} register={register} error={errors.birthday} type="date" />
        <div className="flex flex-col gap-2 w-full md:w-1/4">
          <label className="text-xs text-gray-500">Sex</label>
          <select className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full" {...register("sex")} defaultValue={data?.sex}>
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>

      {/* ── Assign Classes & Subjects ── */}
      <span className="text-xs text-gray-400 font-medium">Assign Classes &amp; Subjects</span>
      <div className="border rounded-lg p-3 bg-gray-50 space-y-3">
        {assignments.map((a, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <select
              value={a.class_id}
              onChange={(e) => updateAssignment(idx, "class_id", e.target.value)}
              className="flex-1 ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm"
            >
              <option value="">Select Class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.grade})</option>
              ))}
            </select>
            <select
              value={a.subject_id}
              onChange={(e) => updateAssignment(idx, "subject_id", e.target.value)}
              className="flex-1 ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm"
            >
              <option value="">Select Subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button type="button" onClick={() => removeAssignment(idx)} className="text-red-500 hover:text-red-700 font-bold px-2">×</button>
          </div>
        ))}
        <button type="button" onClick={addAssignment} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
          + Add Class/Subject
        </button>
        {assignments.length === 0 && (
          <p className="text-xs text-orange-500">No classes assigned. Add class/subject pairs above.</p>
        )}
      </div>

      {submitMsg && <p className={`text-sm ${submitMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{submitMsg}</p>}
      <button type="submit" disabled={loading} className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50">
        {loading ? "Saving..." : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default TeacherForm;
