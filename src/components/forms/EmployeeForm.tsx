"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import InputField from "../InputField";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { EMPLOYEE_CATEGORIES, rolesForCategory } from "@/lib/employeeRoles";

const schema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().optional(),
  phone: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  job_title: z.string().min(1, "Job title is required"),
  hire_date: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;

/** Add / edit an employee profile. Drives the cascading category → job
 *  title dropdown from EMPLOYEE_CATEGORIES, calls create_user_with_profile
 *  with role = "employee" for new entries, then UPDATEs the new profile
 *  with the employment metadata in one go. */
const EmployeeForm = ({ type, data }: { type: "create" | "update"; data?: any }) => {
  const supabase = createClient();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const initialCategory: string = data?.employee_category || "";
  const [category, setCategory] = useState<string>(initialCategory);

  const {
    register, handleSubmit, formState: { errors }, setValue,
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: data?.first_name || "",
      last_name: data?.last_name || "",
      email: data?.email || "",
      password: "",
      phone: data?.phone || "",
      category: data?.employee_category || "",
      job_title: data?.job_title || "",
      hire_date: data?.hire_date ? String(data.hire_date).slice(0, 10) : "",
    },
  });

  const roleOptions = useMemo(() => rolesForCategory(category), [category]);

  const onSubmit = handleSubmit(async (formData) => {
    if (!supabase || !user?.schoolId) return;
    setLoading(true);
    setMsg("");
    try {
      let employeeId: string | undefined = data?.id;

      if (type === "create") {
        if (!formData.password) throw new Error("Password is required to create the account");
        const { data: result, error } = await supabase.rpc("create_user_with_profile", {
          p_email: formData.email,
          p_password: formData.password,
          p_role: "employee",
          p_first_name: formData.first_name,
          p_last_name: formData.last_name,
          p_phone: formData.phone || null,
          p_address: null,
        });
        if (error) throw error;
        if (!result || result.error) throw new Error(result?.error || "Failed to create employee");
        employeeId = result.profile_id;
        if (!employeeId) throw new Error("No profile ID returned");
      }

      // Apply / update the employment metadata + (for updates) basic fields.
      const updatePayload: Record<string, unknown> = {
        employee_category: formData.category,
        job_title: formData.job_title,
        hire_date: formData.hire_date || null,
      };
      if (type === "update") {
        updatePayload.first_name = formData.first_name;
        updatePayload.last_name = formData.last_name;
        updatePayload.email = formData.email;
        updatePayload.phone = formData.phone || null;
      }
      const { error: updateError } = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("id", employeeId);
      if (updateError) throw updateError;

      setMsg(type === "create" ? "Employee added!" : "Employee updated!");
      setTimeout(() => window.location.reload(), 900);
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  });

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Add employee" : "Update employee"}
      </h1>

      <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Identity</span>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField label="First name" name="first_name" register={register} error={errors.first_name} />
        <InputField label="Last name" name="last_name" register={register} error={errors.last_name} />
        <InputField label="Email" name="email" register={register} error={errors.email} />
        <InputField label="Phone" name="phone" register={register} error={errors.phone} />
        {type === "create" && (
          <InputField label="Password" name="password" type="password" register={register} error={errors.password} />
        )}
      </div>

      <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Role</span>
      <div className="flex justify-between flex-wrap gap-4">
        <label className="flex flex-col gap-2 text-xs text-gray-500 w-full md:w-[48%]">
          Category
          <select
            value={category}
            {...register("category", {
              onChange: (e) => {
                setCategory(e.target.value);
                // reset the job title when the category changes
                setValue("job_title", "");
              },
            })}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
          >
            <option value="">Select a category</option>
            {EMPLOYEE_CATEGORIES.map((c, i) => (
              <option key={c.category} value={c.category}>
                {i + 1}. {c.category}
              </option>
            ))}
          </select>
          {errors.category && <span className="text-red-400 text-xs">{errors.category.message}</span>}
        </label>

        <label className="flex flex-col gap-2 text-xs text-gray-500 w-full md:w-[48%]">
          Job title
          <select
            {...register("job_title")}
            disabled={!category}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="">{category ? "Select a job title" : "Pick a category first"}</option>
            {roleOptions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {errors.job_title && <span className="text-red-400 text-xs">{errors.job_title.message}</span>}
        </label>

        <InputField label="Hire date" name="hire_date" type="date" register={register} error={errors.hire_date} />
      </div>

      {msg && <p className={`text-sm ${msg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{msg}</p>}
      <button
        type="submit"
        disabled={loading}
        className="bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a] text-white p-2 rounded-md disabled:opacity-50"
      >
        {loading ? "Saving..." : type === "create" ? "Add employee" : "Update employee"}
      </button>
    </form>
  );
};

export default EmployeeForm;
