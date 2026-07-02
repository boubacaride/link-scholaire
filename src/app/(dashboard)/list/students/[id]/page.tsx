"use client";

// Single student profile. Fetches the REAL student by the [id] route param
// (RLS scopes to the admin's school) instead of the old hardcoded template.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import Performance from "@/components/Performance";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

interface StudentProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  blood_type: string | null;
  date_of_birth: string | null;
  place_of_birth: string | null;
  gender: string | null;
  avatar_url: string | null;
  institutional_id: string | null;
  role: string;
}

const FALLBACK_AVATAR =
  "https://images.pexels.com/photos/5414817/pexels-photo-5414817.jpeg?auto=compress&cs=tinysrgb&w=1200";

const SingleStudentPage = () => {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const { user } = useAuth();
  const supabase = createClient();

  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [klass, setKlass] = useState<{ name: string; grade: number } | null>(null);
  const [attendance, setAttendance] = useState<{ present: number; late: number; absent: number; excused: number }>(
    { present: 0, late: 0, absent: 0, excused: 0 },
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !id) { setLoading(false); return; }
    setLoading(true);

    const [profRes, enrolRes, attRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, first_name, last_name, email, phone, address, blood_type, date_of_birth, place_of_birth, gender, avatar_url, institutional_id, role")
        .eq("id", id)
        .single(),
      supabase
        .from("student_classes")
        .select("enrolled_at, classes(name, grade)")
        .eq("student_id", id)
        .order("enrolled_at", { ascending: false })
        .limit(1),
      supabase
        .from("attendance")
        .select("status")
        .eq("student_id", id),
    ]);

    setStudent((profRes.data as StudentProfile) ?? null);

    const enrol = (enrolRes.data as { classes: { name: string; grade: number } | { name: string; grade: number }[] | null }[] | null)?.[0];
    const cls = enrol ? (Array.isArray(enrol.classes) ? enrol.classes[0] : enrol.classes) : null;
    setKlass(cls ?? null);

    const counts = { present: 0, late: 0, absent: 0, excused: 0 };
    (attRes.data as { status: keyof typeof counts }[] | null)?.forEach((r) => {
      if (r.status in counts) counts[r.status] += 1;
    });
    setAttendance(counts);

    setLoading(false);
  }, [supabase, id]);

  useEffect(() => { load(); }, [load]);

  const attendanceRate = useMemo(() => {
    const denom = attendance.present + attendance.late + attendance.absent + attendance.excused;
    return denom ? `${Math.round(((attendance.present + attendance.late) / denom) * 100)}%` : "—";
  }, [attendance]);

  const fullName = student ? `${student.first_name} ${student.last_name}`.trim() : "";
  const dob = student?.date_of_birth
    ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(student.date_of_birth))
    : "—";

  if (loading) {
    return <div className="flex-1 p-4"><div className="bg-white rounded-md p-8 text-center text-sm text-gray-400">Loading…</div></div>;
  }
  if (!student) {
    return (
      <div className="flex-1 p-4">
        <div className="bg-white rounded-md p-8 text-center">
          <p className="text-sm text-gray-600">Student not found.</p>
          <Link href="/list/students" className="text-sm text-blue-600 hover:underline mt-2 inline-block">← Back to students</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 flex flex-col gap-4 xl:flex-row">
      {/* LEFT */}
      <div className="w-full xl:w-2/3">
        {/* TOP */}
        <div className="flex flex-col lg:flex-row gap-4">
          {/* USER INFO CARD */}
          <div className="bg-lamaSky py-6 px-4 rounded-md flex-1 flex gap-4">
            <div className="w-1/3">
              <Image
                src={student.avatar_url || FALLBACK_AVATAR}
                alt={fullName}
                width={144}
                height={144}
                className="w-36 h-36 rounded-full object-cover"
                unoptimized
              />
            </div>
            <div className="w-2/3 flex flex-col justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold">{fullName}</h1>
                {student.institutional_id && (
                  <p className="text-xs text-gray-600 mt-1">ID: {student.institutional_id}</p>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap text-xs font-medium">
                <div className="w-full md:w-1/3 lg:w-full 2xl:w-1/3 flex items-center gap-2">
                  <Image src="/blood.png" alt="" width={14} height={14} />
                  <span>{student.blood_type || "—"}</span>
                </div>
                <div className="w-full md:w-1/3 lg:w-full 2xl:w-1/3 flex items-center gap-2">
                  <Image src="/date.png" alt="" width={14} height={14} />
                  <span>{dob}</span>
                </div>
                <div className="w-full md:w-1/3 lg:w-full 2xl:w-1/3 flex items-center gap-2">
                  <Image src="/mail.png" alt="" width={14} height={14} />
                  <span className="truncate">{student.email || "—"}</span>
                </div>
                <div className="w-full md:w-1/3 lg:w-full 2xl:w-1/3 flex items-center gap-2">
                  <Image src="/phone.png" alt="" width={14} height={14} />
                  <span>{student.phone || "—"}</span>
                </div>
              </div>
            </div>
          </div>
          {/* SMALL CARDS */}
          <div className="flex-1 flex gap-4 justify-between flex-wrap">
            <div className="bg-white p-4 rounded-md flex gap-4 w-full md:w-[48%] xl:w-[45%] 2xl:w-[48%]">
              <Image src="/singleAttendance.png" alt="" width={24} height={24} className="w-6 h-6" />
              <div>
                <h1 className="text-xl font-semibold">{attendanceRate}</h1>
                <span className="text-sm text-gray-400">Attendance</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-md flex gap-4 w-full md:w-[48%] xl:w-[45%] 2xl:w-[48%]">
              <Image src="/singleBranch.png" alt="" width={24} height={24} className="w-6 h-6" />
              <div>
                <h1 className="text-xl font-semibold">{klass ? klass.grade : "—"}</h1>
                <span className="text-sm text-gray-400">Grade</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-md flex gap-4 w-full md:w-[48%] xl:w-[45%] 2xl:w-[48%]">
              <Image src="/singleClass.png" alt="" width={24} height={24} className="w-6 h-6" />
              <div>
                <h1 className="text-xl font-semibold">{klass ? klass.name : "—"}</h1>
                <span className="text-sm text-gray-400">Class</span>
              </div>
            </div>
            <div className="bg-white p-4 rounded-md flex gap-4 w-full md:w-[48%] xl:w-[45%] 2xl:w-[48%]">
              <Image src="/singleLesson.png" alt="" width={24} height={24} className="w-6 h-6" />
              <div>
                <h1 className="text-xl font-semibold capitalize">{student.gender || "—"}</h1>
                <span className="text-sm text-gray-400">Gender</span>
              </div>
            </div>
          </div>
        </div>
        {/* BOTTOM */}
        <div className="mt-4 bg-white rounded-md p-4 h-[800px]">
          <h1>Student&apos;s Schedule</h1>
          <BigCalendar />
        </div>
      </div>
      {/* RIGHT */}
      <div className="w-full xl:w-1/3 flex flex-col gap-4">
        <div className="bg-white p-4 rounded-md">
          <h1 className="text-xl font-semibold">Shortcuts</h1>
          <div className="mt-4 flex gap-4 flex-wrap text-xs text-gray-500">
            <Link className="p-3 rounded-md bg-lamaSkyLight" href="/list/results">Student&apos;s Results</Link>
            <Link className="p-3 rounded-md bg-lamaPurpleLight" href="/list/attendance">Attendance</Link>
            <Link className="p-3 rounded-md bg-pink-50" href="/list/exams">Exams</Link>
            <Link className="p-3 rounded-md bg-lamaSkyLight" href="/list/assignments">Assignments</Link>
            <Link className="p-3 rounded-md bg-lamaYellowLight" href="/list/lessons">Lessons</Link>
          </div>
        </div>
        <Performance />
        <Announcements />
      </div>
    </div>
  );
};

export default SingleStudentPage;
