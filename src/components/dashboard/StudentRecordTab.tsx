"use client";

import { useEffect, useMemo, useState } from "react";
import StudentAssignments from "@/components/dashboard/StudentAssignments";
import {
  AlertRow,
  AttendanceRing,
  EmptyHint,
  MiniStat,
  Panel,
  SummaryStat,
  gradeColor,
  type PanelAccent,
} from "@/components/dashboard/PortalUI";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

export type StudentRecordTabId =
  | "student-information"
  | "planner"
  | "schedule"
  | "attendance"
  | "activities"
  | "resources"
  | "report-card"
  | "assessment-scores"
  | "school-information"
  | "news"
  | "calendar"
  | "class-information"
  | "family-information"
  | "alerts";

interface ProfileRow {
  id: string;
  school_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  date_of_birth: string | null;
  gender: string | null;
}

interface SchoolRow {
  name: string;
  type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
}

interface ClassRow {
  id: string;
  name: string;
  grade: string;
  section: string | null;
  academic_year: string;
  supervisor_name: string;
}

interface CourseRow {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  teacher_name: string;
  teacher_email: string | null;
}

interface LessonRow {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  subject_name: string;
  teacher_name: string;
}

interface GradeRow {
  id: string;
  subject_id: string;
  subject_name: string;
  exam_type: string;
  score: number;
  max_score: number;
  term: string;
  remarks: string | null;
  created_at: string;
}

interface AttendanceRow {
  id: string;
  date: string;
  status: string;
}

interface ContentRow {
  id: string;
  title: string;
  description: string | null;
  type: string;
  content_body: string | null;
  file_urls: string[];
  due_date: string | null;
  max_score: number | null;
  subject_name: string;
  class_name: string;
}

interface SubmissionRow {
  content_id: string;
  status: string;
  score: number | null;
}

interface AnnouncementRow {
  id: string;
  title: string;
  description: string;
  created_at: string;
  author_name: string;
}

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
}

interface FamilyRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
}

interface NotificationRow {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const one = (value: any) => Array.isArray(value) ? value[0] : value;
const shortDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—";
const shortTime = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return new Date(2026, 0, 1, hour, minute).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const pct = (grade: GradeRow) => grade.max_score ? (grade.score / grade.max_score) * 100 : 0;
const letterGrade = (value: number) =>
  value >= 93 ? "A" : value >= 90 ? "A-" : value >= 87 ? "B+" : value >= 83 ? "B" :
  value >= 80 ? "B-" : value >= 77 ? "C+" : value >= 73 ? "C" : value >= 70 ? "C-" :
  value >= 67 ? "D+" : value >= 63 ? "D" : value >= 60 ? "D-" : "F";

const statusClass = (status: string) => {
  switch (status) {
    case "present":
    case "graded":
    case "submitted":
      return "bg-green-100 text-green-700";
    case "absent":
    case "missing":
      return "bg-red-100 text-red-700";
    case "late":
      return "bg-amber-100 text-amber-700";
    case "excused":
      return "bg-sky-100 text-sky-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
};

const EmptyState = ({ title, detail }: { title: string; detail: string }) => (
  <div className="py-10 text-center">
    <p className="text-sm font-medium text-gray-500">{title}</p>
    <p className="text-xs text-gray-400 mt-1">{detail}</p>
  </div>
);

const DetailGrid = ({ items }: { items: { label: string; value: string }[] }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden">
    {items.map((item) => (
      <div key={item.label} className="bg-white p-4">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">{item.label}</p>
        <p className="text-sm font-medium text-gray-700 mt-1">{item.value || "—"}</p>
      </div>
    ))}
  </div>
);

const DataTable = ({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) => (
  <div className="overflow-x-auto border border-gray-100 rounded-xl">
    <table className="w-full min-w-[620px] text-sm">
      <thead className="bg-[#eef3f7] text-gray-600 text-xs">
        <tr>
          {headers.map((header) => <th key={header} className="text-left font-semibold px-3 py-2.5">{header}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className="hover:bg-gray-50">
            {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 text-gray-600">{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default function StudentRecordTab({
  tab,
  studentId,
  readOnly = false,
  accent = "indigo",
}: {
  tab: StudentRecordTabId;
  studentId?: string;
  readOnly?: boolean;
  accent?: PanelAccent;
}) {
  const { user } = useAuth();
  const supabase = createClient();
  const targetId = studentId || user?.profileId;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [school, setSchool] = useState<SchoolRow | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [content, setContent] = useState<ContentRow[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [family, setFamily] = useState<FamilyRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [term, setTerm] = useState("All");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!supabase || !targetId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const [{ data: profileData }, { data: enrollmentData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, school_id, first_name, last_name, email, phone, address, city, state, date_of_birth, gender")
          .eq("id", targetId)
          .single(),
        supabase
          .from("student_classes")
          .select("class_id, academic_year, class:class_id(id, name, grade, section, academic_year, supervisor:supervisor_id(first_name, last_name))")
          .eq("student_id", targetId),
      ]);

      if (cancelled) return;

      const nextProfile = profileData as ProfileRow | null;
      const nextClasses: ClassRow[] = (enrollmentData || []).map((row: any) => {
        const cls = one(row.class) || {};
        const supervisor = one(cls.supervisor) || {};
        return {
          id: row.class_id,
          name: cls.name || "Class",
          grade: String(cls.grade ?? "—"),
          section: cls.section || null,
          academic_year: row.academic_year || cls.academic_year || "—",
          supervisor_name: [supervisor.first_name, supervisor.last_name].filter(Boolean).join(" ") || "—",
        };
      });
      const classIds = nextClasses.map((item) => item.id);
      const schoolId = nextProfile?.school_id || user?.schoolId;
      const empty = Promise.resolve({ data: [] as any[] });

      const [
        schoolResult,
        courseResult,
        lessonResult,
        gradeResult,
        attendanceResult,
        contentResult,
        submissionResult,
        announcementResult,
        eventResult,
        familyLinksResult,
        notificationResult,
      ] = await Promise.all([
        schoolId
          ? supabase.from("schools").select("name, type, address, city, state, country, phone, email").eq("id", schoolId).single()
          : Promise.resolve({ data: null }),
        classIds.length
          ? supabase.from("class_subjects").select("id, subject:subject_id(name, code, description), teacher:teacher_id(first_name, last_name, email)").in("class_id", classIds)
          : empty,
        classIds.length
          ? supabase.from("lessons").select("id, day_of_week, start_time, end_time, subject:subject_id(name), teacher:teacher_id(first_name, last_name)").in("class_id", classIds).order("day_of_week").order("start_time")
          : empty,
        supabase.from("grades").select("id, subject_id, exam_type, score, max_score, term, remarks, created_at, subject:subject_id(name)").eq("student_id", targetId).order("created_at", { ascending: false }),
        supabase.from("attendance").select("id, date, status").eq("student_id", targetId).order("date", { ascending: false }),
        classIds.length
          ? supabase.from("content").select("id, title, description, type, content_body, file_urls, due_date, max_score, subject:subject_id(name), class:class_id(name)").in("class_id", classIds).eq("is_published", true).order("created_at", { ascending: false })
          : empty,
        supabase.from("submissions").select("content_id, status, score").eq("student_id", targetId),
        schoolId
          ? supabase.from("announcements").select("id, title, description, class_id, created_at, author:author_id(first_name, last_name)").eq("school_id", schoolId).order("created_at", { ascending: false })
          : empty,
        schoolId
          ? supabase.from("events").select("id, title, description, class_id, start_date, end_date").eq("school_id", schoolId).order("start_date")
          : empty,
        supabase.from("parent_students").select("parent_id").eq("student_id", targetId),
        supabase.from("notifications").select("id, title, message, type, is_read, created_at").order("created_at", { ascending: false }),
      ]);

      const parentIds = (familyLinksResult.data || []).map((row: any) => row.parent_id);
      const familyResult = parentIds.length
        ? await supabase.from("profiles").select("id, first_name, last_name, email, phone").in("id", parentIds)
        : { data: [] as any[] };

      if (cancelled) return;

      setProfile(nextProfile);
      setSchool((schoolResult.data as SchoolRow | null) || null);
      setClasses(nextClasses);
      setCourses((courseResult.data || []).map((row: any) => {
        const subject = one(row.subject) || {};
        const teacher = one(row.teacher) || {};
        return {
          id: row.id,
          name: subject.name || "Course",
          code: subject.code || null,
          description: subject.description || null,
          teacher_name: [teacher.first_name, teacher.last_name].filter(Boolean).join(" ") || "—",
          teacher_email: teacher.email || null,
        };
      }));
      setLessons((lessonResult.data || []).map((row: any) => {
        const subject = one(row.subject) || {};
        const teacher = one(row.teacher) || {};
        return {
          id: row.id,
          day_of_week: row.day_of_week,
          start_time: row.start_time,
          end_time: row.end_time,
          subject_name: subject.name || "Course",
          teacher_name: [teacher.first_name, teacher.last_name].filter(Boolean).join(" ") || "—",
        };
      }));
      setGrades((gradeResult.data || []).map((row: any) => ({
        id: row.id,
        subject_id: row.subject_id,
        subject_name: one(row.subject)?.name || "Course",
        exam_type: row.exam_type || "Assessment",
        score: Number(row.score),
        max_score: Number(row.max_score),
        term: row.term || "—",
        remarks: row.remarks || null,
        created_at: row.created_at,
      })));
      setAttendance((attendanceResult.data as AttendanceRow[]) || []);
      setContent((contentResult.data || []).map((row: any) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type,
        content_body: row.content_body,
        file_urls: row.file_urls || [],
        due_date: row.due_date,
        max_score: row.max_score,
        subject_name: one(row.subject)?.name || "Course",
        class_name: one(row.class)?.name || "Class",
      })));
      setSubmissions((submissionResult.data as SubmissionRow[]) || []);
      setAnnouncements((announcementResult.data || [])
        .filter((row: any) => !row.class_id || classIds.includes(row.class_id))
        .map((row: any) => {
          const author = one(row.author) || {};
          return {
            id: row.id,
            title: row.title,
            description: row.description,
            created_at: row.created_at,
            author_name: [author.first_name, author.last_name].filter(Boolean).join(" ") || "School",
          };
        }));
      setEvents((eventResult.data || []).filter((row: any) => !row.class_id || classIds.includes(row.class_id)));
      setFamily((familyResult.data as FamilyRow[]) || []);
      setNotifications((notificationResult.data as NotificationRow[]) || []);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [targetId, user?.schoolId]);

  const submissionMap = useMemo(
    () => new Map(submissions.map((submission) => [submission.content_id, submission])),
    [submissions]
  );

  const plannerItems = useMemo(() => content.filter((item) => item.type !== "lesson").map((item) => {
    const submission = submissionMap.get(item.id);
    const overdue = item.due_date && new Date(item.due_date).getTime() < Date.now();
    return { ...item, status: submission?.status || (overdue ? "missing" : "pending"), score: submission?.score ?? null };
  }), [content, submissionMap]);

  const attendanceStats = useMemo(() => {
    const present = attendance.filter((item) => item.status === "present").length;
    const absences = attendance.filter((item) => item.status === "absent").length;
    const tardies = attendance.filter((item) => item.status === "late").length;
    const excused = attendance.filter((item) => item.status === "excused").length;
    const rate = attendance.length ? ((present + tardies) / attendance.length) * 100 : 0;
    return { present, absences, tardies, excused, rate };
  }, [attendance]);

  const terms = useMemo(() => Array.from(new Set(grades.map((grade) => grade.term))), [grades]);
  const filteredGrades = term === "All" ? grades : grades.filter((grade) => grade.term === term);
  const reportRows = useMemo(() => {
    const grouped = new Map<string, GradeRow[]>();
    filteredGrades.forEach((grade) => {
      const list = grouped.get(grade.subject_id) || [];
      list.push(grade);
      grouped.set(grade.subject_id, list);
    });
    return Array.from(grouped.values()).map((items) => {
      const average = items.reduce((sum, item) => sum + pct(item), 0) / items.length;
      return { subject: items[0].subject_name, average, count: items.length };
    });
  }, [filteredGrades]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-10 text-center">
        <div className="w-7 h-7 border-2 border-gray-300 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-gray-400 mt-3">Loading student records...</p>
      </div>
    );
  }

  if (!targetId) {
    return <EmptyState title="Student record unavailable" detail="Sign in or select a student to view this tab." />;
  }

  if (tab === "planner" && !readOnly) {
    return (
      <Panel title="Planner" icon="📝" accent="amber">
        <StudentAssignments />
      </Panel>
    );
  }

  switch (tab) {
    case "student-information":
      return (
        <Panel title="Student Information" icon="👤" accent={accent}>
          <div className="flex items-center gap-4 mb-5 bg-gray-50 rounded-xl p-4">
            <div className="w-14 h-14 rounded-xl bg-gray-800 text-white flex items-center justify-center font-bold text-lg">
              {profile ? `${profile.first_name[0]}${profile.last_name[0]}` : "ST"}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">{profile ? `${profile.first_name} ${profile.last_name}` : "Student"}</h2>
              <p className="text-xs text-gray-400">{classes[0]?.name || "No active class"} · {classes[0]?.academic_year || "Current year"}</p>
            </div>
          </div>
          <DetailGrid items={[
            { label: "Student ID", value: profile?.id || "—" },
            { label: "Email", value: profile?.email || "—" },
            { label: "Phone", value: profile?.phone || "Not provided" },
            { label: "Date of birth", value: shortDate(profile?.date_of_birth || null) },
            { label: "Gender", value: profile?.gender || "Not provided" },
            { label: "Address", value: [profile?.address, profile?.city, profile?.state].filter(Boolean).join(", ") || "Not provided" },
          ]} />
        </Panel>
      );

    case "planner":
      return (
        <Panel title="Planner" icon="📝" accent="amber">
          {plannerItems.length === 0 ? (
            <EmptyState title="No planner items" detail="Published assignments and classwork will appear here." />
          ) : (
            <DataTable headers={["Assignment", "Course", "Due", "Status", "Score"]} rows={plannerItems.map((item) => [
              <div key="title"><p className="font-medium text-gray-800">{item.title}</p><p className="text-xs text-gray-400">{item.description || item.type}</p></div>,
              item.subject_name,
              shortDate(item.due_date),
              <span key="status" className={`text-[10px] px-2 py-1 rounded-full font-semibold uppercase ${statusClass(item.status)}`}>{item.status}</span>,
              item.score === null ? "—" : `${item.score}/${item.max_score || 100}`,
            ])} />
          )}
        </Panel>
      );

    case "schedule":
      return (
        <Panel title="Schedule" icon="🗓️" accent="indigo">
          {lessons.length === 0 ? (
            <EmptyState title="No schedule posted" detail="The weekly class schedule will appear here." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map((day) => (
                <div key={day} className="border border-gray-100 rounded-xl overflow-hidden">
                  <h3 className="bg-indigo-50 text-indigo-700 text-xs font-semibold px-3 py-2">{DAYS[day]}</h3>
                  <div className="divide-y divide-gray-100">
                    {lessons.filter((lesson) => lesson.day_of_week === day).length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-5">No classes</p>
                    ) : lessons.filter((lesson) => lesson.day_of_week === day).map((lesson) => (
                      <div key={lesson.id} className="p-3">
                        <p className="text-sm font-medium text-gray-800">{lesson.subject_name}</p>
                        <p className="text-[11px] text-indigo-500 mt-1">{shortTime(lesson.start_time)} - {shortTime(lesson.end_time)}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{lesson.teacher_name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      );

    case "attendance":
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryStat label="Attendance" value={attendance.length ? `${attendanceStats.rate.toFixed(0)}%` : "—"} accent="sky" icon="📅" />
            <SummaryStat label="Present" value={String(attendanceStats.present)} accent="emerald" icon="✓" />
            <SummaryStat label="Absent" value={String(attendanceStats.absences)} accent="red" icon="!" />
            <SummaryStat label="Tardy" value={String(attendanceStats.tardies)} accent="amber" icon="⏱" />
          </div>
          <Panel title="Daily Attendance" icon="📅" accent="sky">
            {attendance.length === 0 ? (
              <EmptyState title="No attendance records" detail="Daily attendance will appear here." />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[190px_1fr] gap-5">
                <div className="bg-gray-50 rounded-xl p-5 flex items-center justify-center">
                  <div className="flex items-center gap-4">
                    <AttendanceRing rate={attendanceStats.rate} />
                    <div className="grid grid-cols-1 gap-2">
                      <MiniStat label="Excused" value={attendanceStats.excused} tone="sky" />
                      <MiniStat label="Tardies" value={attendanceStats.tardies} tone="amber" />
                    </div>
                  </div>
                </div>
                <DataTable headers={["Date", "Status"]} rows={attendance.map((item) => [
                  shortDate(item.date),
                  <span key="status" className={`text-[10px] px-2 py-1 rounded-full font-semibold uppercase ${statusClass(item.status)}`}>{item.status}</span>,
                ])} />
              </div>
            )}
          </Panel>
        </div>
      );

    case "activities":
      return (
        <Panel title="Activities" icon="⭐" accent="purple">
          {events.length === 0 && submissions.length === 0 ? (
            <EmptyState title="No recent activities" detail="School events and completed coursework will appear here." />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">School activities</h3>
                {events.slice(0, 8).map((event) => (
                  <div key={event.id} className="border border-gray-100 rounded-xl p-3">
                    <p className="text-sm font-medium text-gray-800">{event.title}</p>
                    <p className="text-xs text-purple-500 mt-1">{shortDate(event.start_date)}</p>
                    {event.description && <p className="text-xs text-gray-500 mt-1">{event.description}</p>}
                  </div>
                ))}
                {events.length === 0 && <EmptyHint text="No school activities posted." />}
              </div>
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Course activity</h3>
                {submissions.slice(0, 8).map((submission) => {
                  const item = content.find((entry) => entry.id === submission.content_id);
                  return (
                    <div key={submission.content_id} className="border border-gray-100 rounded-xl p-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{item?.title || "Coursework"}</p>
                        <p className="text-xs text-gray-400">{item?.subject_name || "Course"}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-full font-semibold uppercase ${statusClass(submission.status)}`}>{submission.status}</span>
                    </div>
                  );
                })}
                {submissions.length === 0 && <EmptyHint text="No coursework activity yet." />}
              </div>
            </div>
          )}
        </Panel>
      );

    case "resources": {
      const resources = content.filter((item) => item.type === "lesson" || item.file_urls.length > 0);
      return (
        <Panel title="Resources" icon="📄" accent="emerald">
          {resources.length === 0 ? (
            <EmptyState title="No resources available" detail="Teacher-posted lessons and files will appear here." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {resources.map((resource) => (
                <div key={resource.id} className="border border-gray-100 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-800">{resource.title}</p>
                  <p className="text-xs text-emerald-600 mt-1">{resource.subject_name} · {resource.class_name}</p>
                  <p className="text-xs text-gray-500 mt-3 line-clamp-3">{resource.description || resource.content_body || "Course resource"}</p>
                  {resource.file_urls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {resource.file_urls.map((url, index) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 font-medium hover:underline">
                          Open file {index + 1}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      );
    }

    case "report-card":
      return (
        <Panel title="Report Card" icon="🔖" accent={accent}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-800">{profile ? `${profile.first_name} ${profile.last_name}` : "Student"}</p>
              <p className="text-xs text-gray-400">{school?.name || user?.schoolName || "School"} · {classes[0]?.academic_year || "Current year"}</p>
            </div>
            <select value={term} onChange={(event) => setTerm(event.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <option>All</option>
              {terms.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          {reportRows.length === 0 ? (
            <EmptyState title="No report card available" detail="A report card will be generated from posted grades." />
          ) : (
            <DataTable headers={["Course", "Average", "Grade", "Scores"]} rows={reportRows.map((row) => [
              <span key="subject" className="font-medium text-gray-800">{row.subject}</span>,
              <span key="average" className={`font-semibold ${gradeColor(row.average)}`}>{row.average.toFixed(2)}%</span>,
              letterGrade(row.average),
              String(row.count),
            ])} />
          )}
        </Panel>
      );

    case "assessment-scores":
      return (
        <Panel title="Assessment Scores" icon="📖" accent="purple">
          <div className="flex justify-end mb-4">
            <select value={term} onChange={(event) => setTerm(event.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white">
              <option>All</option>
              {terms.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          {filteredGrades.length === 0 ? (
            <EmptyState title="No assessment scores" detail="Tests, quizzes, projects, and other assessments will appear here." />
          ) : (
            <DataTable headers={["Assessment", "Course", "Period", "Date", "Score"]} rows={filteredGrades.map((grade) => [
              <div key="assessment"><p className="font-medium text-gray-800">{grade.exam_type}</p>{grade.remarks && <p className="text-xs text-gray-400">{grade.remarks}</p>}</div>,
              grade.subject_name,
              grade.term,
              shortDate(grade.created_at),
              <span key="score" className={`font-semibold ${gradeColor(pct(grade))}`}>{grade.score}/{grade.max_score} · {pct(grade).toFixed(0)}%</span>,
            ])} />
          )}
        </Panel>
      );

    case "school-information":
      return (
        <Panel title="School Information" icon="🏫" accent="sky">
          <div className="bg-sky-50 rounded-xl p-4 mb-5">
            <h2 className="text-lg font-semibold text-gray-800">{school?.name || user?.schoolName || "School"}</h2>
            <p className="text-xs text-sky-600 capitalize mt-1">{school?.type || "Public"} school</p>
          </div>
          <DetailGrid items={[
            { label: "Address", value: [school?.address, school?.city, school?.state, school?.country].filter(Boolean).join(", ") || "Not provided" },
            { label: "Phone", value: school?.phone || "Not provided" },
            { label: "Email", value: school?.email || "Not provided" },
            { label: "School type", value: school?.type || "Public" },
          ]} />
        </Panel>
      );

    case "news":
      return (
        <Panel title="News" icon="📰" accent="sky">
          {announcements.length === 0 ? (
            <EmptyState title="No school news" detail="School and class announcements will appear here." />
          ) : (
            <div className="space-y-3">
              {announcements.map((item) => (
                <div key={item.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{item.title}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">By {item.author_name}</p>
                    </div>
                    <span className="text-xs text-sky-600 shrink-0">{shortDate(item.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-3">{item.description}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      );

    case "calendar":
      return (
        <Panel title="Calendar" icon="📅" accent="indigo">
          {events.length === 0 ? (
            <EmptyState title="No events scheduled" detail="School and class events will appear here." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {events.map((event) => (
                <div key={event.id} className="border border-gray-100 rounded-xl p-4 flex gap-3">
                  <div className="w-12 h-12 rounded-lg bg-indigo-50 text-indigo-600 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] font-semibold uppercase">{new Date(event.start_date).toLocaleDateString([], { month: "short" })}</span>
                    <span className="text-lg font-bold leading-none">{new Date(event.start_date).getDate()}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{event.title}</p>
                    <p className="text-xs text-indigo-500 mt-1">{new Date(event.start_date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                    {event.description && <p className="text-xs text-gray-500 mt-1">{event.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      );

    case "class-information":
      return (
        <div className="space-y-4">
          <Panel title="Class Information" icon="🏫" accent="indigo">
            {classes.length === 0 ? (
              <EmptyState title="No class enrollment" detail="Active class information will appear here." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {classes.map((item) => (
                  <div key={item.id} className="border border-gray-100 rounded-xl p-4">
                    <p className="text-base font-semibold text-gray-800">{item.name}</p>
                    <p className="text-xs text-indigo-500 mt-1">Grade {item.grade}{item.section ? ` · Section ${item.section}` : ""}</p>
                    <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                      <div><p className="text-gray-400">Academic year</p><p className="font-medium text-gray-700 mt-1">{item.academic_year}</p></div>
                      <div><p className="text-gray-400">Supervisor</p><p className="font-medium text-gray-700 mt-1">{item.supervisor_name}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <Panel title="Courses and Teachers" icon="📚" accent="sky">
            {courses.length === 0 ? (
              <EmptyState title="No courses assigned" detail="Course and teacher information will appear here." />
            ) : (
              <DataTable headers={["Course", "Code", "Teacher", "Contact"]} rows={courses.map((course) => [
                <div key="course"><p className="font-medium text-gray-800">{course.name}</p><p className="text-xs text-gray-400">{course.description || "Course"}</p></div>,
                course.code || "—",
                course.teacher_name,
                course.teacher_email || "—",
              ])} />
            )}
          </Panel>
        </div>
      );

    case "family-information":
      return (
        <Panel title="Family Information" icon="👨‍👩‍👧" accent="amber">
          {family.length === 0 ? (
            <EmptyState title="No family contacts listed" detail="Linked parent and guardian contacts will appear here." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {family.map((member) => (
                <div key={member.id} className="border border-gray-100 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                    {member.first_name[0]}{member.last_name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{member.first_name} {member.last_name}</p>
                    <p className="text-xs text-amber-600">Parent / Guardian</p>
                    <p className="text-xs text-gray-400 truncate mt-1">{member.email}</p>
                    {member.phone && <p className="text-xs text-gray-400">{member.phone}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      );

    case "alerts": {
      const missing = plannerItems.filter((item) => item.status === "missing").length;
      const lowGrades = reportRows.filter((row) => row.average < 60).length;
      return (
        <div className="space-y-4">
          <Panel title="Alerts" icon="🔔" accent="amber">
            <div className="space-y-2">
              {missing > 0 && <AlertRow tone="red" title="Missing work" detail={`${missing} assignment${missing === 1 ? "" : "s"} past due.`} />}
              {attendanceStats.absences > 0 && <AlertRow tone="orange" title="Attendance notice" detail={`${attendanceStats.absences} absence${attendanceStats.absences === 1 ? "" : "s"} recorded.`} />}
              {lowGrades > 0 && <AlertRow tone="yellow" title="Grade notice" detail={`${lowGrades} course${lowGrades === 1 ? "" : "s"} currently below 60%.`} />}
              {missing === 0 && attendanceStats.absences === 0 && lowGrades === 0 && (
                <AlertRow tone="green" title="All caught up" detail="There are no academic alerts right now." />
              )}
            </div>
          </Panel>
          <Panel title="Notifications" icon="📣" accent="sky">
            {notifications.length === 0 ? (
              <EmptyState title="No notifications" detail="Account and school notifications will appear here." />
            ) : (
              <div className="space-y-2">
                {notifications.map((item) => (
                  <div key={item.id} className={`border rounded-xl p-3 ${item.is_read ? "border-gray-100" : "border-sky-100 bg-sky-50/50"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-gray-800">{item.title}</p>
                      <span className="text-[11px] text-gray-400">{shortDate(item.created_at)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{item.message}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      );
  }
}
}
