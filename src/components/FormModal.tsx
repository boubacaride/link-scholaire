"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// USE LAZY LOADING

// import TeacherForm from "./forms/TeacherForm";
// import StudentForm from "./forms/StudentForm";

const TeacherForm = dynamic(() => import("./forms/TeacherForm"), {
  loading: () => <h1>Loading...</h1>,
});
const StudentForm = dynamic(() => import("./forms/StudentForm"), {
  loading: () => <h1>Loading...</h1>,
});
const ParentForm = dynamic(() => import("./forms/ParentForm"), {
  loading: () => <h1>Loading...</h1>,
});
const SubjectForm = dynamic(() => import("./forms/SubjectForm"), {
  loading: () => <h1>Loading...</h1>,
});
const ClassForm = dynamic(() => import("./forms/ClassForm"), {
  loading: () => <h1>Loading...</h1>,
});
const LessonForm = dynamic(() => import("./forms/LessonForm"), {
  loading: () => <h1>Loading...</h1>,
});
const ExamForm = dynamic(() => import("./forms/ExamForm"), {
  loading: () => <h1>Loading...</h1>,
});
const AssignmentForm = dynamic(() => import("./forms/AssignmentForm"), {
  loading: () => <h1>Loading...</h1>,
});
const ResultForm = dynamic(() => import("./forms/ResultForm"), {
  loading: () => <h1>Loading...</h1>,
});
const EventForm = dynamic(() => import("./forms/EventForm"), {
  loading: () => <h1>Loading...</h1>,
});
const AnnouncementForm = dynamic(() => import("./forms/AnnouncementForm"), {
  loading: () => <h1>Loading...</h1>,
});

const forms: {
  [key: string]: (type: "create" | "update", data?: any) => JSX.Element;
} = {
  teacher: (type, data) => <TeacherForm type={type} data={data} />,
  student: (type, data) => <StudentForm type={type} data={data} />,
  parent: (type, data) => <ParentForm type={type} data={data} />,
  subject: (type, data) => <SubjectForm type={type} data={data} />,
  class: (type, data) => <ClassForm type={type} data={data} />,
  lesson: (type, data) => <LessonForm type={type} data={data} />,
  exam: (type, data) => <ExamForm type={type} data={data} />,
  assignment: (type, data) => <AssignmentForm type={type} data={data} />,
  result: (type, data) => <ResultForm type={type} data={data} />,
  event: (type, data) => <EventForm type={type} data={data} />,
  announcement: (type, data) => <AnnouncementForm type={type} data={data} />,
};

const FormModal = ({
  table,
  type,
  data,
  id,
}: {
  table:
    | "teacher"
    | "student"
    | "parent"
    | "subject"
    | "class"
    | "lesson"
    | "exam"
    | "assignment"
    | "result"
    | "attendance"
    | "event"
    | "announcement";
  type: "create" | "update" | "delete";
  data?: any;
  id?: number | string;
}) => {
  const size = type === "create" ? "w-8 h-8" : "w-7 h-7";
  const bgColor =
    type === "create"
      ? "bg-lamaYellow"
      : type === "update"
      ? "bg-lamaSky"
      : "bg-lamaPurple";

  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState("");

  // Map table names to Supabase table names
  const tableMap: Record<string, string> = {
    teacher: "profiles",
    student: "profiles",
    parent: "profiles",
    subject: "subjects",
    class: "classes",
    lesson: "content",
    exam: "content",
    assignment: "content",
    result: "grades",
    attendance: "attendance",
    event: "events",
    announcement: "announcements",
  };

  const handleDelete = async () => {
    if (!id) return;
    const supabase = createClient();
    if (!supabase) return;
    setDeleting(true);
    setDeleteMsg("");
    try {
      const dbTable = tableMap[table];
      if (!dbTable) throw new Error("Unknown table");
      const { error } = await supabase.from(dbTable).delete().eq("id", id);
      if (error) throw error;
      setDeleteMsg("Deleted successfully!");
      setTimeout(() => { setOpen(false); window.location.reload(); }, 800);
    } catch (err: any) {
      setDeleteMsg(`Error: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const Form = () => {
    return type === "delete" && id ? (
      <div className="p-4 flex flex-col gap-4">
        <span className="text-center font-medium">
          All data will be lost. Are you sure you want to delete this {table}?
        </span>
        {deleteMsg && (
          <p className={`text-sm text-center ${deleteMsg.startsWith("Error") ? "text-red-500" : "text-green-600"}`}>{deleteMsg}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => setOpen(false)}
            className="bg-gray-200 text-gray-700 py-2 px-4 rounded-md border-none"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="bg-red-700 text-white py-2 px-4 rounded-md border-none disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    ) : (type === "create" || type === "update") && forms[table] ? (
      forms[table](type, data)
    ) : (
      "Form not found!"
    );
  };

  return (
    <>
      <button
        className={`${size} flex items-center justify-center rounded-full ${bgColor}`}
        onClick={() => setOpen(true)}
      >
        <Image src={`/${type}.png`} alt="" width={16} height={16} />
      </button>
      {open && (
        <div className="w-screen h-screen fixed left-0 top-0 bg-black bg-opacity-60 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
          <div className="bg-white p-4 rounded-md relative w-[90%] md:w-[70%] lg:w-[60%] xl:w-[50%] 2xl:w-[40%] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <Form />
            <div
              className="absolute top-4 right-4 cursor-pointer"
              onClick={() => setOpen(false)}
            >
              <Image src="/close.png" alt="" width={14} height={14} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FormModal;
