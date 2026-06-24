"use client";

// Schedule calendar — custom CSS-grid layout inspired by the Jackson
// River College timetable design (day columns across the top, 30-min
// hour gutter on the left, class blocks rendered as cards). The
// previous react-big-calendar shell didn't allow the level of card
// styling the school asked for, so this component owns the layout
// end-to-end while still consuming the same `lessons` data the old
// version did.
//
// Highlights
//   • School name + current semester (active academic_year + matching
//     term, if configured) sit in a header band styled with the
//     emerald accent the student / parent grade panels already use.
//   • View toggle keeps the existing two tabs — work-week (Mon–Fri)
//     and day — using the same labels as before.
//   • A live red "now" line sweeps across the visible day(s) so a
//     student / teacher can see how close their next class is.
//   • ICS download stays available for export.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────

interface LessonRow {
  id: string;
  day_of_week: number;          // PG convention: 0 = Sun, 1 = Mon, …
  start_time: string;           // "HH:MM:SS"
  end_time: string;
  class_id: string;
  subject_id: string;
}

interface ClassEvent {
  id: string;
  /** 0 = Monday … 4 = Friday (we keep the schedule Mon–Fri). */
  dayIndex: number;
  startMinutes: number;          // minutes from midnight
  endMinutes: number;
  subjectName: string;
  teacherName?: string;
  classCode: string;             // e.g. "Algebra II" or "PSY 1002"
}

type View = "work_week" | "day";

const DAY_LABELS: Record<"en" | "fr" | "ar", string[]> = {
  en: ["MON", "TUE", "WED", "THU", "FRI"],
  fr: ["LUN", "MAR", "MER", "JEU", "VEN"],
  ar: ["الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"],
};

// 08:00 → 18:00 with 30-minute granularity. Match the reference.
const START_HOUR = 8;
const END_HOUR = 18;
const SLOT_MINUTES = 30;
const SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;
const ROW_PX = 24;              // height per 30-min row → 10 hours = 480 px

// Convert "HH:MM[:SS]" to minutes from midnight, robust to formats.
const toMinutes = (t: string): number => {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
};

// Format minutes-from-midnight as "h:mm am/pm".
const fmtHour = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${period}`;
};

// ─── ICS export (kept from the old component) ─────────────────────

function buildICS(events: ClassEvent[], calendarName: string): string {
  const now = new Date();
  // Anchor week to this Monday so RRULE WEEKLY repeats from a known date.
  const monday = new Date(now);
  const day = monday.getDay();                                   // 0 = Sun
  const diff = (day === 0 ? -6 : 1 - day);                        // shift to Monday
  monday.setDate(monday.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  const fmt = (d: Date) => {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    const ss = String(d.getUTCSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
  };

  const lines: string[] = [
    "BEGIN:VCALENDAR", "VERSION:2.0",
    "PRODID:-//Link Scholaire//Schedule//EN",
    `X-WR-CALNAME:${calendarName}`,
    "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
  ];
  for (const ev of events) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + ev.dayIndex);
    const start = new Date(day);
    start.setHours(0, ev.startMinutes, 0, 0);
    const end = new Date(day);
    end.setHours(0, ev.endMinutes, 0, 0);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.id}@link-scholaire`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      "RRULE:FREQ=WEEKLY;BYDAY=" + ["MO","TU","WE","TH","FR"][ev.dayIndex],
      `SUMMARY:${ev.subjectName}${ev.classCode ? " (" + ev.classCode + ")" : ""}`,
      ev.teacherName ? `DESCRIPTION:${ev.teacherName}` : "",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}

// ─── Live "now" line ──────────────────────────────────────────────

/** Returns minutes from midnight, recomputed every minute. */
function useNowMinutes(): number {
  const [m, setM] = useState(() => {
    const d = new Date(); return d.getHours() * 60 + d.getMinutes();
  });
  useEffect(() => {
    const tick = () => {
      const d = new Date(); setM(d.getHours() * 60 + d.getMinutes());
    };
    // Align the next tick to the start of the next minute, then run every 60s.
    const ms = 60_000 - (new Date().getSeconds() * 1000);
    const timeout = setTimeout(() => {
      tick();
      const id = setInterval(tick, 60_000);
      (timeout as unknown as { _id?: ReturnType<typeof setInterval> })._id = id;
    }, ms);
    return () => clearTimeout(timeout);
  }, []);
  return m;
}

// ─── Component ────────────────────────────────────────────────────

const BigCalendar = () => {
  const { user } = useAuth();
  const { t, locale } = useI18n();
  const supabase = createClient();

  const [view, setView] = useState<View>("work_week");
  // Day-view: which weekday index (0=Mon..4=Fri) to display. Default to today.
  const [dayIndex, setDayIndex] = useState<number>(() => {
    const d = new Date().getDay();                                // 0=Sun
    if (d === 0 || d === 6) return 0;                              // weekends → Mon
    return d - 1;
  });

  const [events, setEvents] = useState<ClassEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [semester, setSemester] = useState<string>("");           // "TRIMESTRE 1 2025-2026" or similar

  const dayLabels = DAY_LABELS[locale as "en" | "fr" | "ar"] ?? DAY_LABELS.en;

  // ── Load lessons + active academic year/term for the header ─────
  useEffect(() => {
    const load = async () => {
      if (!supabase || !user) { setLoading(false); return; }
      try {
        // 1) Lessons for the role.
        let lessons: LessonRow[] = [];
        if (user.role === "student") {
          const { data: enrols } = await supabase
            .from("student_classes").select("class_id")
            .eq("student_id", user.profileId);
          const classIds = (enrols || []).map((e: { class_id: string }) => e.class_id);
          if (classIds.length) {
            const { data } = await supabase
              .from("lessons")
              .select("id, day_of_week, start_time, end_time, class_id, subject_id")
              .in("class_id", classIds);
            lessons = (data as LessonRow[]) || [];
          }
        } else if (user.role === "teacher") {
          const { data } = await supabase
            .from("lessons")
            .select("id, day_of_week, start_time, end_time, class_id, subject_id")
            .eq("teacher_id", user.profileId);
          lessons = (data as LessonRow[]) || [];
        }

        // 2) Hydrate subject + class names (+ teacher name if student view).
        const classIds = Array.from(new Set(lessons.map((l) => l.class_id)));
        const subjectIds = Array.from(new Set(lessons.map((l) => l.subject_id)));
        const [{ data: classes }, { data: subjects }] = await Promise.all([
          classIds.length
            ? supabase.from("classes").select("id, name").in("id", classIds)
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
          subjectIds.length
            ? supabase.from("subjects").select("id, name").in("id", subjectIds)
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        ]);
        const classNameMap = new Map((classes || []).map((c) => [c.id, c.name]));
        const subjectNameMap = new Map((subjects || []).map((s) => [s.id, s.name]));

        // Teacher name lookup — fetched once per (class, subject) for the
        // student view; teachers already know their own name.
        const teacherByCs = new Map<string, string>();
        if (user.role === "student" && classIds.length && subjectIds.length) {
          const { data: cs } = await supabase
            .from("class_subjects")
            .select("class_id, subject_id, teacher:teacher_id(first_name, last_name)")
            .in("class_id", classIds)
            .in("subject_id", subjectIds);
          type CsRow = {
            class_id: string;
            subject_id: string;
            teacher: { first_name: string; last_name: string } | null;
          };
          for (const r of ((cs as unknown as CsRow[]) || [])) {
            if (r.teacher) {
              teacherByCs.set(
                `${r.class_id}|${r.subject_id}`,
                `${r.teacher.first_name} ${r.teacher.last_name}`.trim(),
              );
            }
          }
        }

        // 3) Active academic year + matching term for the semester chip.
        const { data: activeYear } = await supabase
          .from("academic_years")
          .select("id, name")
          .eq("school_id", user.schoolId)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (activeYear) {
          const today = new Date().toISOString().slice(0, 10);
          const { data: currentTerm } = await supabase
            .from("terms")
            .select("name")
            .eq("academic_year_id", activeYear.id)
            .lte("start_date", today)
            .gte("end_date", today)
            .limit(1)
            .maybeSingle();
          setSemester(
            currentTerm
              ? `${currentTerm.name} · ${activeYear.name}`
              : activeYear.name,
          );
        }

        // 4) Build the events, dropping weekend lessons + clamping times.
        setEvents(
          lessons
            // Map PG day_of_week (0=Sun..6=Sat) to grid day index (0=Mon..4=Fri).
            .map((l) => {
              const grid =
                l.day_of_week === 0 ? 6 : l.day_of_week - 1;  // Sun=6, Mon=0
              return {
                id: l.id,
                dayIndex: grid,
                startMinutes: Math.max(toMinutes(l.start_time), START_HOUR * 60),
                endMinutes: Math.min(toMinutes(l.end_time), END_HOUR * 60),
                subjectName: subjectNameMap.get(l.subject_id) || "—",
                teacherName: teacherByCs.get(`${l.class_id}|${l.subject_id}`),
                classCode: classNameMap.get(l.class_id) || "",
              };
            })
            .filter((e) => e.dayIndex >= 0 && e.dayIndex <= 4)   // Mon-Fri
            .filter((e) => e.endMinutes > e.startMinutes),
        );
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.profileId, user?.role]);

  // Filter events to whichever view the user is on.
  const visibleEvents = useMemo(
    () => (view === "day" ? events.filter((e) => e.dayIndex === dayIndex) : events),
    [events, view, dayIndex],
  );

  // Live now-line position (in pixels from the top of the grid).
  const nowMin = useNowMinutes();
  const nowVisible = nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;
  const todayMon = (() => {
    const d = new Date().getDay();
    if (d === 0 || d === 6) return -1;                            // weekend
    return d - 1;
  })();
  const nowOffsetPx = ((nowMin - START_HOUR * 60) / SLOT_MINUTES) * ROW_PX;

  // ICS download.
  const downloadICS = useCallback(() => {
    if (events.length === 0) return;
    const ics = buildICS(events, `${user?.firstName || "My"} ${user?.lastName || ""} — Schedule`);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [events, user?.firstName, user?.lastName]);

  // Auto-scroll so "now" is visible when the calendar mounts and it's
  // during the school day. Avoids the teacher having to hunt for it.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (loading || !scrollRef.current || !nowVisible) return;
    scrollRef.current.scrollTo({
      top: Math.max(0, nowOffsetPx - 120),
      behavior: "smooth",
    });
    // Run once on first paint with real events.
  }, [loading, events.length]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ─────────────────────────────────────────────────────

  const visibleDays = view === "day" ? [dayIndex] : [0, 1, 2, 3, 4];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Header — school name + semester */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[1.5px] text-emerald-600 font-semibold">
            {semester || t("dash.student.mySchedule")}
          </p>
          <h3 className="text-base font-semibold text-gray-800 truncate">
            {user?.schoolName || "Schedule"}
          </h3>
        </div>

        {/* View toggle — same two tabs as before (work_week + day). */}
        <div className="flex bg-gray-50 rounded-lg p-0.5 border border-gray-100">
          <button
            onClick={() => setView("work_week")}
            className={`text-[11px] font-medium px-3 py-1 rounded-md transition-colors ${
              view === "work_week"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t("cal.workWeek")}
          </button>
          <button
            onClick={() => setView("day")}
            className={`text-[11px] font-medium px-3 py-1 rounded-md transition-colors ${
              view === "day"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t("cal.day")}
          </button>
        </div>

        <button
          onClick={downloadICS}
          disabled={events.length === 0}
          className="text-[11px] font-medium px-2.5 py-1.5 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed"
          title={t("cal.downloadCalendar")}
        >
          ⬇ {t("cal.downloadCalendar")}
        </button>
      </div>

      {/* Emerald accent strip — matches the Grades panel design language */}
      <div className="h-1 bg-gradient-to-r from-emerald-500 to-emerald-400" />

      {/* Day selector strip (day view only) */}
      {view === "day" && (
        <div className="flex gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50">
          {dayLabels.map((label, i) => (
            <button
              key={label}
              onClick={() => setDayIndex(i)}
              className={`flex-1 text-[11px] font-semibold py-1.5 rounded-md transition-colors ${
                i === dayIndex
                  ? "bg-white text-emerald-700 border border-emerald-200 shadow-sm"
                  : "text-gray-500 hover:bg-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Week-view day header strip */}
      {view === "work_week" && (
        <div
          className="grid border-b border-gray-100 bg-gray-50"
          style={{ gridTemplateColumns: `64px repeat(5, minmax(0, 1fr))` }}
        >
          <div />
          {dayLabels.map((label, i) => (
            <div
              key={label}
              className={`text-center py-2.5 text-[11px] font-bold tracking-wider ${
                i === todayMon ? "text-emerald-700" : "text-gray-500"
              }`}
            >
              {label}
              {i === todayMon && (
                <span className="block mt-0.5 mx-auto w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Schedule body */}
      <div ref={scrollRef} className="relative overflow-y-auto" style={{ maxHeight: 520 }}>
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-10">{t("common.loading")}</p>
        ) : (
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: `64px repeat(${visibleDays.length}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${SLOTS}, ${ROW_PX}px)`,
            }}
          >
            {/* Hour gutter labels — one label every two rows (every 30 min). */}
            {Array.from({ length: SLOTS }).map((_, idx) => {
              const mins = START_HOUR * 60 + idx * SLOT_MINUTES;
              return (
                <div
                  key={`hour-${idx}`}
                  className="text-[10px] text-gray-400 pr-2 text-right border-r border-gray-100 leading-none pt-1"
                  style={{ gridColumn: 1, gridRow: idx + 1 }}
                >
                  {fmtHour(mins)}
                </div>
              );
            })}

            {/* Day-column backgrounds — dotted row lines per 30-min slot */}
            {visibleDays.map((_, colI) => (
              <div
                key={`col-bg-${colI}`}
                className="border-r border-gray-100"
                style={{
                  gridColumn: colI + 2,
                  gridRow: `1 / ${SLOTS + 1}`,
                  backgroundImage:
                    "linear-gradient(to bottom, transparent calc(100% - 1px), rgba(229, 231, 235, 0.5) calc(100% - 1px))",
                  backgroundSize: `100% ${ROW_PX}px`,
                }}
              />
            ))}

            {/* Class blocks */}
            {visibleEvents.map((ev) => {
              // Convert the event to a grid-row span. +1 because grid-rows
              // are 1-indexed; the second number is exclusive.
              const startRow =
                Math.max(0, (ev.startMinutes - START_HOUR * 60) / SLOT_MINUTES) + 1;
              const endRow =
                Math.min(SLOTS, (ev.endMinutes - START_HOUR * 60) / SLOT_MINUTES) + 1;
              const colIdx = view === "day" ? 0 : ev.dayIndex;
              return (
                <div
                  key={ev.id}
                  className="m-0.5 rounded-md bg-emerald-50/70 hover:bg-emerald-100/80 border border-emerald-200 px-2 py-1.5 overflow-hidden cursor-default transition-colors"
                  style={{
                    gridColumn: colIdx + 2,
                    gridRow: `${startRow} / ${endRow}`,
                  }}
                  title={`${ev.subjectName} — ${ev.classCode}`}
                >
                  <p className="text-[11px] font-bold text-emerald-900 uppercase tracking-tight leading-tight truncate">
                    {ev.subjectName}
                  </p>
                  {ev.teacherName && (
                    <p className="text-[10px] italic text-emerald-700 mt-0.5 truncate">
                      {ev.teacherName}
                    </p>
                  )}
                  <p className="text-[10px] text-emerald-800 mt-1 font-medium">
                    {fmtHour(ev.startMinutes)} – {fmtHour(ev.endMinutes)}
                  </p>
                  {ev.classCode && (
                    <p className="text-[10px] text-emerald-600 mt-0.5 truncate">{ev.classCode}</p>
                  )}
                </div>
              );
            })}

            {/* Live "now" indicator — absolute overlay above all cells. */}
            {nowVisible && (view === "work_week"
              ? todayMon >= 0                     // hide on weekends in week view
              : dayIndex === todayMon             // day view: only on today
            ) && (
              <div
                className="absolute left-0 right-0 pointer-events-none z-10"
                style={{ top: nowOffsetPx }}
              >
                {/* Time pill on the gutter */}
                <div className="absolute left-0 -translate-y-1/2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                  {fmtHour(nowMin)}
                </div>
                {/* The line itself, offset past the gutter (64 px) */}
                <div
                  className="absolute h-px bg-red-500"
                  style={{ left: 64, right: 0, top: 0 }}
                />
                <div
                  className="absolute w-2 h-2 bg-red-500 rounded-full"
                  style={{ left: 64 - 4, top: -3 }}
                />
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && events.length === 0 && (
          <div className="text-center py-10">
            <div className="text-3xl mb-2">🗓️</div>
            <p className="text-sm text-gray-500">{t("cal.empty")}</p>
            <p className="text-[11px] text-gray-400 mt-1">{t("cal.emptyHint")}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BigCalendar;
