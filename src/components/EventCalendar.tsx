"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
}

/** Render an event's time as a "10:00 AM – 12:00 PM" range, or "All day"
 *  when start and end land on midnight (the value entered by the date-only
 *  form input). The form's `<input type="date">` serializes as UTC
 *  midnight in TIMESTAMPTZ, so the all-day check must use UTC components
 *  — otherwise a non-UTC viewer sees a non-zero local hour and never gets
 *  the "All day" label. */
const formatTimeRange = (
  start: string,
  end: string,
  locale: string,
  allDayLabel: string
) => {
  const s = new Date(start);
  const e = new Date(end);
  const isUtcMidnight = (d: Date) =>
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  if (isUtcMidnight(s) && isUtcMidnight(e)) return allDayLabel;
  const fmt = (d: Date) =>
    d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${fmt(s)} – ${fmt(e)}`;
};

const EventCalendar = () => {
  const [value, onChange] = useState<Value>(new Date());
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { t, locale } = useI18n();
  const supabase = createClient();

  // The single-select calendar always gives a Date; range-mode would give
  // a tuple. We only support single-day filtering here.
  const selectedDate: Date | null = Array.isArray(value) ? value[0] : value;

  useEffect(() => {
    // Guard against a slow earlier request resolving after the user has
    // already clicked a newer day — without this flag the older response
    // would overwrite the newer day's events.
    let cancelled = false;
    const load = async () => {
      if (!supabase || !selectedDate) {
        if (!cancelled) {
          setEvents([]);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      // Fetch any event that intersects the selected calendar day, in
      // UTC. The EventForm's <input type="date"> stores values as UTC
      // midnight in the TIMESTAMPTZ column, so anchoring the window in
      // the viewer's local timezone would skew it (e.g. a viewer in
      // America/Los_Angeles asking for "June 15" would look at
      // 2026-06-15 07:00Z–2026-06-16 06:59Z and miss an event whose
      // end_date is 2026-06-15 00:00Z). Use the calendar's local
      // year/month/day as the UTC anchor to match how the data was
      // entered. RLS scopes the result to the user's school
      // automatically.
      const y = selectedDate.getFullYear();
      const m = selectedDate.getMonth();
      const d = selectedDate.getDate();
      const dayStart = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
      const dayEnd = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
      const { data } = await supabase
        .from("events")
        .select("id, title, description, start_date, end_date")
        .lte("start_date", dayEnd.toISOString())
        .gte("end_date", dayStart.toISOString())
        .order("start_date", { ascending: true });
      if (cancelled) return;
      setEvents((data as EventRow[]) || []);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
    // selectedDate is a Date; depend on its day to avoid refetch on every
    // re-render with a structurally-equal Date.
  }, [selectedDate?.toDateString()]);

  return (
    <div className="bg-white p-4 rounded-md">
      <Calendar onChange={onChange} value={value} />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold my-4">{t("ui.events")}</h1>
        <Image src="/moreDark.png" alt="" width={20} height={20} />
      </div>
      <div className="flex flex-col gap-4">
        {loading ? (
          <p className="text-gray-400 text-sm">{t("ui.loading")}</p>
        ) : events.length === 0 ? (
          <p className="text-gray-400 text-sm">{t("ui.noEventsToday")}</p>
        ) : (
          events.map((event) => (
            <div
              className="p-5 rounded-md border-2 border-gray-100 border-t-4 odd:border-t-lamaSky even:border-t-lamaPurple"
              key={event.id}
            >
              <div className="flex items-center justify-between gap-2">
                <h1 className="font-semibold text-gray-600 truncate">{event.title}</h1>
                <span className="text-gray-400 text-xs whitespace-nowrap">
                  {formatTimeRange(event.start_date, event.end_date, locale, t("ui.allDay"))}
                </span>
              </div>
              {event.description && (
                <p className="mt-2 text-gray-400 text-sm">{event.description}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EventCalendar;
