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

const StudentForm = ({ type, data }: { type: "create" | "update"; data?: any }) => {
  const { register, handleSubmit, formState: { errors } } = useForm<Inputs>({ resolver: zodResolver(schema) });
  const supabase = createClient();
  const { user } = useAuth();

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");

  // Fetch all classes
  useEffect(() => {
    const fetchClasses = async () => {
      if (!supabase) return;
      const { data: classList } = await supabase
        .from("classes")
        .select("id, name, grade")
        .order("grade")
        .order("name");
      if (classList) setClasses(classList);
    };
    fetchClasses();
  }, []);

  // If editing, load current enrollment
  useEffect(() => {
    const fetchEnrollment = async () => {
      if (!supabase || !data?.id) return;
      const { data: enrollment } = await supabase
        .from("student_classes")
        .select("class_id")
        .eq("student_id", data.id)
        .limit(1)
        .single();
      if (enrollment) setSelectedClassId(enrollment.class_id);
    };
    if (type === "update" && data?.id) fetchEnrollment();
  }, [data?.id, type]);

  const onSubmit = handleSubmit(async (formData) => {
    if (!supabase || !user?.schoolId) return;
    setLoading(true);
    setSubmitMsg("");
    try {
      let studentId = data?.id;

      if (type === "create") {
        const { data: result, error } = await supabase.rpc("create_user_with_profile", {
          p_email: formData.email,
          p_password: formData.password,
          p_role: "student",
          p_first_name: formData.firstName,
          p_last_name: formData.lastName,
          p_phone: formData.phone || null,
          p_address: formData.address || null,
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        studentId = result.profile_id;
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
          .eq("id", studentId);
        if (error) throw error;
      }

      // Sync student_classes enrollment
      if (studentId) {
        await supabase.from("student_classes").delete().eq("student_id", studentId);
        if (selectedClassId) {
          const { error } = await supabase.from("student_classes").insert({
            student_id: studentId,
            class_id: selectedClassId,
            academic_year: new Date().getFullYear().toString(),
          });
          if (error) throw error;
        }
      }

      setSubmitMsg(type === "create" ? "Student created!" : "Student updated!");
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
        {type === "create" ? "Create a new student" : "Update student"}
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

      {/* ── Enroll in Class ── */}
      <span className="text-xs text-gray-400 font-medium">Enroll in Class</span>
      <div className="border rounded-lg p-3 bg-gray-50">
        <select
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
          className="w-full ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm"
        >
          <option value="">— Select a class —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name} (Grade {c.grade})</option>
          ))}
        </select>
        {!selectedClassId && (
          <p className="text-xs text-orange-500 mt-2">No class selected. Choose a class to enroll this student.</p>
        )}
      </div>

      {submitMsg && <p className={`text-sm ${submitMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{submitMsg}</p>}
      <button type="submit" disabled={loading} className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50">
        {loading ? "Saving..." : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default StudentForm;
