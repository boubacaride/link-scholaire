"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState, useEffect } from "react";
import InputField from "../InputField";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const schema = z.object({
  username: z
    .string()
    .min(3, { message: "Username must be at least 3 characters long!" })
    .max(20, { message: "Username must be at most 20 characters long!" }),
  email: z.string().email({ message: "Invalid email address!" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long!" }),
  firstName: z.string().min(1, { message: "First name is required!" }),
  lastName: z.string().min(1, { message: "Last name is required!" }),
  phone: z.string().min(1, { message: "Phone is required!" }),
  address: z.string().min(1, { message: "Address is required!" }),
});

type Inputs = z.infer<typeof schema>;

interface Student {
  id: string;
  first_name: string;
  last_name: string;
}

const ParentForm = ({
  type,
  data,
}: {
  type: "create" | "update";
  data?: any;
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    resolver: zodResolver(schema),
  });

  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitMsg, setSubmitMsg] = useState("");

  const supabase = createClient();
  const { user } = useAuth();

  // Fetch all students in the same school
  useEffect(() => {
    const fetchStudents = async () => {
      if (!supabase) return;
      const { data: studentList } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("role", "student")
        .order("first_name");
      if (studentList) setStudents(studentList);
    };
    fetchStudents();
  }, []);

  // If editing, load currently linked students
  useEffect(() => {
    const fetchLinked = async () => {
      if (!supabase || !data?.id) return;
      const { data: links } = await supabase
        .from("parent_students")
        .select("student_id")
        .eq("parent_id", data.id);
      if (links) {
        setSelectedStudentIds(links.map((l: { student_id: string }) => l.student_id));
      }
    };
    if (type === "update" && data?.id) fetchLinked();
  }, [data?.id, type]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const filteredStudents = students.filter((s) =>
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const onSubmit = handleSubmit(async (formData) => {
    if (!supabase || !user?.schoolId) return;
    setLoading(true);
    setSubmitMsg("");

    try {
      let parentId = data?.id;

      if (type === "create") {
        const { data: result, error } = await supabase.rpc("create_user_with_profile", {
          p_email: formData.email,
          p_password: formData.password,
          p_role: "parent",
          p_first_name: formData.firstName,
          p_last_name: formData.lastName,
          p_phone: formData.phone || null,
          p_address: formData.address || null,
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        parentId = result.profile_id;
      } else {
        // Update existing parent
        const { error } = await supabase
          .from("profiles")
          .update({
            first_name: formData.firstName,
            last_name: formData.lastName,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
          })
          .eq("id", parentId);

        if (error) throw error;
      }

      // Sync parent_students links
      if (parentId) {
        // Remove old links
        await supabase
          .from("parent_students")
          .delete()
          .eq("parent_id", parentId);

        // Insert new links
        if (selectedStudentIds.length > 0) {
          const links = selectedStudentIds.map((studentId) => ({
            parent_id: parentId,
            student_id: studentId,
          }));
          const { error: linkError } = await supabase
            .from("parent_students")
            .insert(links);
          if (linkError) throw linkError;
        }
      }

      setSubmitMsg(type === "create" ? "Parent created successfully!" : "Parent updated successfully!");
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      setSubmitMsg(`Error: ${err.message || "Something went wrong"}`);
    } finally {
      setLoading(false);
    }
  });

  return (
    <form className="flex flex-col gap-6" onSubmit={onSubmit}>
      <h1 className="text-xl font-semibold">
        {type === "create" ? "Create a new parent" : "Update parent"}
      </h1>

      <span className="text-xs text-gray-400 font-medium">
        Authentication Information
      </span>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="Username"
          name="username"
          defaultValue={data?.username}
          register={register}
          error={errors?.username}
        />
        <InputField
          label="Email"
          name="email"
          defaultValue={data?.email}
          register={register}
          error={errors?.email}
        />
        <InputField
          label="Password"
          name="password"
          type="password"
          defaultValue={data?.password}
          register={register}
          error={errors?.password}
        />
      </div>

      <span className="text-xs text-gray-400 font-medium">
        Personal Information
      </span>
      <div className="flex justify-between flex-wrap gap-4">
        <InputField
          label="First Name"
          name="firstName"
          defaultValue={data?.firstName || data?.first_name}
          register={register}
          error={errors.firstName}
        />
        <InputField
          label="Last Name"
          name="lastName"
          defaultValue={data?.lastName || data?.last_name}
          register={register}
          error={errors.lastName}
        />
        <InputField
          label="Phone"
          name="phone"
          defaultValue={data?.phone}
          register={register}
          error={errors.phone}
        />
        <InputField
          label="Address"
          name="address"
          defaultValue={data?.address}
          register={register}
          error={errors.address}
        />
      </div>

      {/* ── Link Students Section ── */}
      <span className="text-xs text-gray-400 font-medium">
        Link Students
      </span>
      <div className="border rounded-lg p-3 bg-gray-50">
        {/* Selected students */}
        {selectedStudentIds.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {selectedStudentIds.map((id) => {
              const s = students.find((st) => st.id === id);
              if (!s) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-1 rounded-full"
                >
                  {s.first_name} {s.last_name}
                  <button
                    type="button"
                    onClick={() => toggleStudent(id)}
                    className="text-blue-600 hover:text-red-500 font-bold ml-0.5"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Search students to link..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm mb-2"
        />

        {/* Student list */}
        <div className="max-h-[150px] overflow-y-auto space-y-1">
          {filteredStudents.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">No students found</p>
          ) : (
            filteredStudents.map((s) => (
              <label
                key={s.id}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm transition ${
                  selectedStudentIds.includes(s.id)
                    ? "bg-blue-50 text-blue-800"
                    : "hover:bg-gray-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedStudentIds.includes(s.id)}
                  onChange={() => toggleStudent(s.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {s.first_name} {s.last_name}
              </label>
            ))
          )}
        </div>

        {selectedStudentIds.length === 0 && (
          <p className="text-xs text-orange-500 mt-1">
            No students linked. Select students above to link them to this parent.
          </p>
        )}
      </div>

      {submitMsg && (
        <p className={`text-sm ${submitMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>
          {submitMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="bg-blue-400 text-white p-2 rounded-md disabled:opacity-50"
      >
        {loading ? "Saving..." : type === "create" ? "Create" : "Update"}
      </button>
    </form>
  );
};

export default ParentForm;
