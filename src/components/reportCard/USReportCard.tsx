"use client";

// Presentational "High School Report Card" — laid out to match the classic
// US template: maroon header + navy school badge, student-information row,
// a Subject / 1st-Semester / 2nd-Semester / Final-Grade table, the grading
// scale + attendance, an editable comment, three signature blocks, and a
// navy footer carrying the school's address / phone / email.
//
// Purely visual: all values are passed in as props. The parent page computes
// the grades and owns the comment state. Wrapped in `#report-card-print` so
// the print stylesheet in globals.css can isolate it for "Save as PDF".

import Image from "next/image";
import { US_GRADING_SCALE } from "@/lib/reportCard/usGrades";

export interface ReportCardRow {
  subject: string;
  sem1: string;
  sem2: string;
  final: string;
}

export interface USReportCardProps {
  school: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
  };
  student: { name: string; studentId: string; grade: string; schoolYear: string };
  sem1Label: string;
  sem2Label: string;
  rows: ReportCardRow[];
  attendance: { present: number; absent: number; tardies: number };
  comment: string;
  onCommentChange?: (value: string) => void;
  editable?: boolean;
  signatures: { parent?: string; teacher?: string; principal?: string };
}

const MAROON = "#8b2433";
const NAVY = "#16223f";
const BADGE = "#3f5876";

const USReportCard = ({
  school,
  student,
  sem1Label,
  sem2Label,
  rows,
  attendance,
  comment,
  onCommentChange,
  editable = false,
  signatures,
}: USReportCardProps) => {
  return (
    <div
      id="report-card-print"
      className="bg-white mx-auto w-full max-w-[820px] shadow-sm border border-gray-200"
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      <div className="p-8">
        {/* ── Header: maroon title bar + navy school badge ───────────── */}
        <div className="flex items-stretch gap-4">
          <div
            className="flex-1 flex items-center px-6 py-4 rounded-sm"
            style={{ background: MAROON }}
          >
            <h1 className="text-white text-3xl font-bold tracking-tight">
              High School Report Card
            </h1>
          </div>
          <div
            className="flex items-center gap-3 px-5 py-3 rounded-sm"
            style={{ background: BADGE, minWidth: 190 }}
          >
            {school.logoUrl ? (
              <Image
                src={school.logoUrl}
                alt=""
                width={28}
                height={28}
                className="object-contain"
                unoptimized
              />
            ) : (
              <span className="text-white text-xl">🎓</span>
            )}
            <span className="text-white font-semibold leading-tight">
              {school.name}
            </span>
          </div>
        </div>

        {/* ── Student Information ─────────────────────────────────────── */}
        <h2 className="mt-6 mb-3 text-xl font-bold" style={{ color: MAROON }}>
          Student Information:
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name:" value={student.name} />
          <Field label="Student ID:" value={student.studentId} />
          <Field label="Grade:" value={student.grade} />
          <Field label="School Year:" value={student.schoolYear} />
        </div>

        {/* ── Grade table ────────────────────────────────────────────── */}
        <table className="w-full mt-6 border-collapse text-sm">
          <thead>
            <tr style={{ background: MAROON }} className="text-white text-left">
              <Th className="w-[40%]">Subject</Th>
              <Th>{sem1Label}</Th>
              <Th>{sem2Label}</Th>
              <Th>Final Grade</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="border border-gray-300 px-3 py-4 text-center text-gray-400">
                  No subjects found for this class.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.subject} className={i % 2 ? "bg-gray-50" : "bg-white"}>
                  <Td className="font-medium text-gray-800">{r.subject}</Td>
                  <Td className="text-gray-700">{r.sem1}</Td>
                  <Td className="text-gray-700">{r.sem2}</Td>
                  <Td className="font-semibold text-gray-900">{r.final}</Td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* ── Grading scale + Attendance ──────────────────────────────── */}
        <div className="grid grid-cols-2 gap-8 mt-6">
          <div>
            <h3 className="text-lg font-bold mb-2" style={{ color: MAROON }}>
              Grading Scale:
            </h3>
            <ul className="text-sm text-gray-700 space-y-1">
              {US_GRADING_SCALE.map((g) => (
                <li key={g.letter} className="flex gap-2">
                  <span className="font-bold">{g.letter}:</span>
                  <span>{g.range}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold mb-2" style={{ color: MAROON }}>
              Attendance:
            </h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>
                <span className="font-bold">Days Present:</span> {attendance.present}
              </li>
              <li>
                <span className="font-bold">Days Absent:</span> {attendance.absent}
              </li>
              <li>
                <span className="font-bold">Tardies:</span> {attendance.tardies}
              </li>
            </ul>
          </div>
        </div>

        {/* ── Comments ────────────────────────────────────────────────── */}
        <h3 className="mt-6 mb-2 text-lg font-bold" style={{ color: MAROON }}>
          Comments:
        </h3>
        <textarea
          value={comment}
          onChange={(e) => onCommentChange?.(e.target.value)}
          readOnly={!editable}
          rows={4}
          placeholder={editable ? "Type your comment about the student…" : ""}
          className="w-full text-sm text-gray-700 border border-gray-300 rounded-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-200 read-only:bg-white read-only:cursor-default"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        />

        {/* ── Signatures ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-6 mt-8 text-center">
          <Signature label="Parent's Signature:" name={signatures.parent} />
          <Signature label="Teacher Signature:" name={signatures.teacher} />
          <Signature label="Principal Signature:" name={signatures.principal} />
        </div>
      </div>

      {/* ── Footer: address · phone · email ───────────────────────────── */}
      <div
        className="px-8 py-3 flex flex-wrap items-center justify-center gap-x-8 gap-y-1 text-xs text-white"
        style={{ background: NAVY }}
      >
        {school.address && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden>📍</span>
            {school.address}
          </span>
        )}
        {school.phone && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden>📞</span>
            {school.phone}
          </span>
        )}
        {school.email && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden>✉️</span>
            {school.email}
          </span>
        )}
      </div>
    </div>
  );
};

const Field = ({ label, value, wide }: { label: string; value: string; wide?: boolean }) => (
  <div className={wide ? "col-span-1" : ""}>
    <p className="text-sm font-bold text-gray-800 mb-1">{label}</p>
    <div className="border border-gray-300 rounded-sm px-3 py-2 text-sm text-gray-700 min-h-[38px]">
      {value || "—"}
    </div>
  </div>
);

const Th = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <th className={`border border-gray-300 px-3 py-2 font-semibold ${className}`}>{children}</th>
);

const Td = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <td className={`border border-gray-300 px-3 py-2 ${className}`}>{children}</td>
);

const Signature = ({ label, name }: { label: string; name?: string }) => (
  <div>
    <p className="text-sm font-bold text-gray-800 mb-6">{label}</p>
    <div className="border-t border-gray-500 pt-1 mx-2">
      <p className="text-sm font-semibold text-gray-800 min-h-[20px]">{name || ""}</p>
    </div>
  </div>
);

export default USReportCard;
