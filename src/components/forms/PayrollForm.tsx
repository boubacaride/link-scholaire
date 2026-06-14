"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import InputField from "../InputField";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const schema = z.object({
  employee_id: z.string().min(1, { message: "Employee is required!" }),
  base_salary: z.coerce.number().nonnegative({ message: "Must be 0 or more" }),
  deductions: z.coerce.number().nonnegative().optional(),
  bonuses: z.coerce.number().nonnegative().optional(),
  net_salary: z.coerce.number().nonnegative().optional(),
  pay_period: z.string().min(1, { message: "Pay period is required!" }),
  status: z.enum(["paid", "pending", "overdue", "partial"]),
  paid_at: z.string().optional(),
  notes: z.string().optional(),
});

type Inputs = z.infer<typeof schema>;

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

const PayrollForm = ({ type, data }: { type: "create" | "update"; data?: any }) => {
  const supabase = createClient();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const {
    register, handleSubmit, watch, setValue, formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      employee_id: data?.employee_id || "",
      base_salary: data?.base_salary ?? 0,
      deductions: data?.deductions ?? 0,
      bonuses: data?.bonuses ?? 0,
      net_salary: data?.net_salary ?? 0,
      pay_period: data?.pay_period || new Date().toISOString().slice(0, 7), // YYYY-MM
      status: (data?.status as Inputs["status"]) || "pending",
      paid_at: data?.paid_at ? String(data.paid_at).slice(0, 10) : "",
      notes: data?.notes || "",
    },
  });

  // Load the school's teachers + school admins so the dropdown shows the
  // people who actually get paid.
  useEffect(() => {
    const load = async () => {
      if (!supabase || !user?.schoolId) return;
      const { data: rows } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, role")
        .eq("school_id", user.schoolId)
        .in("role", ["teacher", "school_admin", "employee"])
        .eq("is_active", true)
        .order("last_name");
      setEmployees((rows as Employee[]) || []);
    };
    load();
  }, [user?.schoolId]);

  // Keep net_salary in sync as the admin edits the parts. They can still
  // override it manually after the auto-calc runs.
  const base = Number(watch("base_salary") || 0);
  const ded = Number(watch("deductions") || 0);
  const bon = Number(watch("bonuses") || 0);
  useEffect(() => {
    setValue("net_salary", Math.max(0, base - ded + bon));
  }, [base, ded, bon, setValue]);

  const status = watch("status");

  const onSubmit = handleSubmit(async (formData) => {
    if (!supabase || !user?.schoolId) return;
    setLoading(true);
    setMsg("");
    try {
      const payload: Record<string, unknown> = {
        school_id: user.schoolId,
        employee_id: formData.employee_id,
        base_salary: Math.round(formData.base_salary),
        deductions: Math.round(formData.deductions ?? 0),
        bonuses: Math.round(formData.bonuses ?? 0),
        net_salary: Math.round(
          formData.net_salary ?? formData.base_salary - (formData.deductions ?? 0) + (formData.bonuses ?? 0)
        ),
        pay_period: formData.pay_period,
        status: formData.status,
        paid_at: formData.status === "paid" && formData.paid_at ? formData.paid_at : null,
        notes: formData.notes || null,
      };
      if (type === "create") {
        const { error } = await supabase.from("payroll").insert(payload);
        if (error) throw error;
        setMsg("Payroll record created!");
      } else {
        const { error } = await supabase.from("payroll").update(payload).eq("id", data?.id);
        if (error) throw error;
        setMsg("Payroll record updated!");
      }
      setTimeout(() => window.location.reload(), 800);
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  });

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Add payroll record" : "Update payroll record"}
      </h1>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-xs text-gray-500 flex-1">
          Employee
          <select
            {...register("employee_id")}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
          >
            <option value="">Select an employee</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.first_name} {e.last_name} ({e.role.replace("_", " ")})
              </option>
            ))}
          </select>
          {errors.employee_id && <span className="text-red-400 text-xs">{errors.employee_id.message}</span>}
        </label>

        <div className="flex justify-between flex-wrap gap-4">
          <InputField label="Base salary" name="base_salary" type="number" register={register} error={errors?.base_salary} />
          <InputField label="Deductions" name="deductions" type="number" register={register} error={errors?.deductions} />
          <InputField label="Bonuses" name="bonuses" type="number" register={register} error={errors?.bonuses} />
          <InputField label="Net salary" name="net_salary" type="number" register={register} error={errors?.net_salary} />
        </div>

        <div className="flex justify-between flex-wrap gap-4">
          <InputField label="Pay period (e.g. 2026-06)" name="pay_period" register={register} error={errors?.pay_period} />
          <label className="flex flex-col gap-2 text-xs text-gray-500 flex-1 min-w-[180px]">
            Status
            <select
              {...register("status")}
              className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partial</option>
            </select>
          </label>
          {status === "paid" && (
            <InputField label="Paid at" name="paid_at" type="date" register={register} error={errors?.paid_at} />
          )}
        </div>

        <label className="flex flex-col gap-2 text-xs text-gray-500">
          Notes (optional)
          <textarea
            {...register("notes")}
            rows={3}
            className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full"
          />
        </label>
      </div>

      {msg && <p className={`text-sm ${msg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{msg}</p>}
      <button
        type="submit"
        disabled={loading}
        className="bg-gradient-to-b from-[#4a7eb0] to-[#3a6d9a] text-white p-2 rounded-md disabled:opacity-50"
      >
        {loading ? "Saving..." : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default PayrollForm;
