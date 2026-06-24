"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, momentLocalizer, View, Views } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

const localizer = momentLocalizer(moment);

interface LessonRow {
  id: string;
  day_of_week: number;     // 0–6 (Mon = 1 in PG/moment, Sun = 0)
  start_time: string;       // "HH:MM:SS"
  end_time: string;
  class_id: string;
  subject_id: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
}

/** Take a HH:MM(:SS) string + a base day-of-week, return a Date for the
 *  matching weekday in the current Monday-anchored week. */
function timeToDate(timeStr: string, dayOfWeek: number): Date {
  const [h = "0", m = "0"] = timeStr.split(":");
  // Anchor every week to Monday so the work-week view always lines up.
  const monday = moment().startOf("isoWeek");
  return monday
    .add(dayOfWeek === 0 ? 6 : dayOfWeek - 1, "days")  // PG Sun=0 → end of week
    .hour(Number(h))
    .minute(Number(m))
    .second(0)
    .millisecond(0)
    .toDate();
}

/** Build an iCalendar (.ics) RFC-5545 string from the event list. The events
 *  repeat weekly so each lesson becomes one RRULE entry. */
function buildICS(events: CalendarEvent[], calendarName: string): string {
  const fmt = (d: Date) =>
    moment(d).utc().format("YYYYMMDDTHHmmss") + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Link Scholaire//Schedule//EN",
    `X-WR-CALNAME:${calendarName}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const ev of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.id}@link-scholaire`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(ev.start)}`,
      `DTEND:${fmt(ev.end)}`,
      "RRULE:FREQ=WEEKLY;BYDAY=" + ["SU","MO","TU","WE","TH","FR","SA"][ev.start.getDay()],
      `SUMMARY:${ev.title.replace(/\n/g, " ")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

const BigCalendar = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();

  const [view, setView] = useState<View>(Views.WORK_WEEK);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Pull the right schedule for the role:
  //   • student  → lessons of classes they're enrolled in
  //   • teacher  → lessons they teach
  //   • everyone else → empty
  useEffect(() => {
    const load = async () => {
      if (!supabase || !user) { setLoading(false); return; }
      try {
        let lessons: LessonRow[] = [];

        if (user.role === "student") {
          const { data: enrols } = await supabase
            .from("student_classes")
            .select("class_id")
            .eq("student_id", user.profileId);
          const classIds = (enrols || []).map((e: any) => e.class_id);
          if (classIds.length === 0) { setLoading(false); return; }
          const { data } = await supabase
            .from("lessons")
            .select("id, day_of_week, start_time, end_time, class_id, subject_id")
            .in("class_id", classIds);
          lessons = (data as LessonRow[]) || [];
        } else if (user.role === "teacher") {
          const { data } = await supabase
            .from("lessons")
            .select("id, day_of_week, start_time, end_time, class_id, subject_id")
            .eq("teacher_id", user.profileId);
          lessons = (data as LessonRow[]) || [];
        }

        if (lessons.length === 0) { setEvents([]); setLoading(false); return; }

        // Resolve the related class + subject names in two batched queries.
        const classIds = Array.from(new Set(lessons.map((l) => l.class_id)));
        const subjectIds = Array.from(new Set(lessons.map((l) => l.subject_id)));
        const [{ data: classes }, { data: subjects }] = await Promise.all([
          supabase.from("classes").select("id, name").in("id", classIds),
          supabase.from("subjects").select("id, name").in("id", subjectIds),
        ]);
        const cn = new Map((classes || []).map((c: any) => [c.id, c.name]));
        const sn = new Map((subjects || []).map((s: any) => [s.id, s.name]));

        setEvents(lessons.map((l) => ({
          id: l.id,
          title: `${sn.get(l.subject_id) || ""}\n${cn.get(l.class_id) || ""}`.trim(),
          start: timeToDate(l.start_time, l.day_of_week),
          end:   timeToDate(l.end_time,   l.day_of_week),
        })));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.profileId, user?.role]);

  const downloadICS = () => {
    if (events.length === 0) return;
    const ics = buildICS(events, `${user?.firstName || "My"} ${user?.lastName || ""} — Schedule`);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-${moment().format("YYYY-MM-DD")}.ics`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Anchor the view to this week and clamp visible hours 08:00–18:00.
  const minTime = useMemo(() => moment().startOf("day").hour(8).toDate(), []);
  const maxTime = useMemo(() => moment().startOf("day").hour(18).toDate(), []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs text-gray-400">
          {loading
            ? t("common.loading")
            : t("cal.eventsCount", { n: String(events.length) })}
        </span>
        <button
          onClick={downloadICS}
          disabled={events.length === 0}
          className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-100 disabled:opacity-40 disabled:cursor-not-allowed"
          title={t("cal.downloadCalendar")}
        >
          ⬇ {t("cal.downloadCalendar")}
        </button>
      </div>
      <div className="flex-1 min-h-[420px]">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          views={["work_week", "day"]}
          view={view}
          onView={(v) => setView(v)}
          style={{ height: "100%" }}
          min={minTime}
          max={maxTime}
          step={30}
          timeslots={2}
        />
      </div>
    </div>
  );
};

export default BigCalendar;
