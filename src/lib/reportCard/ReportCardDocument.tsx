// @react-pdf/renderer template for a single student's report card.
// Renders identically in the browser (preview / single download) and in
// a Node task (server-side rendering, should we ever move generation
// to an Edge Function).
//
// All labels are bilingual via the `locale` prop; all colours / labels /
// logo come from the `schoolBranding` prop so a single template serves
// every tenant.

import {
  Document, Page, Text, View, StyleSheet, Image, Font,
} from "@react-pdf/renderer";
import type {
  StudentReportComputed,
  SubjectStats,
  MentionResult,
  Decision,
} from "./calculations";

// ─── Bilingual labels ─────────────────────────────────────────────

const LABELS = {
  en: {
    reportCard: "REPORT CARD",
    student: "Student",
    studentId: "Student ID",
    class: "Class",
    dob: "Date of birth",
    year: "Academic Year",
    term: "Term",
    subject: "Subject",
    coefficient: "Coef.",
    avg: "Avg",
    weighted: "× Coef",
    classAvg: "Class Avg",
    min: "Min",
    max: "Max",
    remark: "Teacher Remark",
    summary: "Summary",
    overall: "Overall Average",
    rank: "Rank",
    mention: "Mention",
    decision: "Decision",
    attendance: "Attendance",
    present: "Present",
    absent: "Absent",
    late: "Late",
    excused: "Excused",
    conduct: "Conduct",
    principalRemark: "Principal's Remark",
    classTeacher: "Class Teacher",
    principal: "Principal",
    parent: "Parent",
    generated: "Generated",
    page: "Page",
    of: "of",
    none: "—",
  },
  fr: {
    reportCard: "BULLETIN SCOLAIRE",
    student: "Élève",
    studentId: "Matricule",
    class: "Classe",
    dob: "Date de naissance",
    year: "Année scolaire",
    term: "Trimestre",
    subject: "Matière",
    coefficient: "Coef.",
    avg: "Moy.",
    weighted: "× Coef",
    classAvg: "Moy. classe",
    min: "Min",
    max: "Max",
    remark: "Appréciation",
    summary: "Synthèse",
    overall: "Moyenne générale",
    rank: "Rang",
    mention: "Mention",
    decision: "Décision",
    attendance: "Présence",
    present: "Présent",
    absent: "Absent",
    late: "Retard",
    excused: "Excusé",
    conduct: "Conduite",
    principalRemark: "Appréciation du directeur",
    classTeacher: "Professeur principal",
    principal: "Directeur",
    parent: "Parent",
    generated: "Généré le",
    page: "Page",
    of: "sur",
    none: "—",
  },
} as const;

type Locale = keyof typeof LABELS;

// ─── Props ────────────────────────────────────────────────────────

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  excused: number;
}

export interface SchoolBranding {
  name: string;
  address?: string;
  logoDataUrl?: string;          // optional, embedded as base64 data URL
  /** Hex colours that drive the header band + accent rule. */
  primaryColor?: string;
  accentColor?: string;
}

export interface StudentBlock {
  fullName: string;
  studentNumber?: string;
  className: string;
  dateOfBirth?: string;
  photoDataUrl?: string;
}

export interface ReportCardDocumentProps {
  branding: SchoolBranding;
  student: StudentBlock;
  academicYear: string;
  termName: string;
  computed: StudentReportComputed & { rank?: number | null; classSize?: number };
  subjectStats: SubjectStats[];            // keyed by subjectId
  remarks?: Record<string, string>;        // subjectId → teacher remark
  attendance: AttendanceSummary;
  conduct?: string;
  principalRemark?: string;
  /** Defaults to the school's primary locale; can be flipped per-PDF. */
  locale?: Locale;
}

// ─── Styles ───────────────────────────────────────────────────────

const baseStyles = (primary: string, accent: string) => StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica", color: "#1f2937" },
  // Header
  headerBand: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: primary, color: "#ffffff",
    padding: 12, borderRadius: 4,
  },
  logo: { width: 44, height: 44 },
  schoolName: { fontSize: 14, fontWeight: 700 },
  schoolAddress: { fontSize: 8, opacity: 0.85 },
  reportTitle: {
    marginTop: 12, fontSize: 13, fontWeight: 700, textAlign: "center",
    letterSpacing: 1, color: "#1f2937",
  },
  accentRule: {
    height: 3, backgroundColor: accent, marginTop: 4, marginBottom: 10, borderRadius: 1,
  },
  // Student block
  studentRow: {
    flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 12,
    padding: 10, border: "1pt solid #e5e7eb", borderRadius: 4,
  },
  studentCol: { flex: 1 },
  studentLabel: { fontSize: 7, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 },
  studentValue: { fontSize: 10, color: "#111827", marginTop: 1 },
  studentPhoto: { width: 56, height: 56, borderRadius: 4, objectFit: "cover" },
  // Subject table
  table: { border: "1pt solid #e5e7eb", borderRadius: 4 },
  thead: { flexDirection: "row", backgroundColor: "#f3f4f6", padding: 6 },
  th: { fontWeight: 700, fontSize: 8, color: "#374151" },
  tr: { flexDirection: "row", padding: 6, borderTop: "1pt solid #f1f5f9" },
  td: { fontSize: 9, color: "#1f2937" },
  // Summary
  summaryBand: {
    flexDirection: "row", gap: 10, marginTop: 14,
  },
  summaryCard: {
    flex: 1, padding: 10, backgroundColor: "#f8fafc", borderRadius: 4,
    border: "1pt solid #e2e8f0",
  },
  summaryLabel: { fontSize: 7, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5 },
  summaryValue: { fontSize: 14, fontWeight: 700, color: primary, marginTop: 2 },
  // Attendance
  attRow: {
    flexDirection: "row", marginTop: 10, padding: 8,
    backgroundColor: "#f8fafc", borderRadius: 4, border: "1pt solid #e2e8f0",
  },
  attCell: { flex: 1, alignItems: "center" },
  attNumber: { fontSize: 12, fontWeight: 700, color: "#111827" },
  attLabel: { fontSize: 7, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 },
  // Signatures
  sigRow: { flexDirection: "row", marginTop: 28, gap: 16 },
  sigCol: { flex: 1, borderTop: "1pt solid #94a3b8", paddingTop: 4 },
  sigLabel: { fontSize: 8, color: "#475569", textAlign: "center" },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 7, color: "#94a3b8",
  },
});

// ─── Helpers ──────────────────────────────────────────────────────

const fmt = (v: number | null | undefined, dash = "—"): string =>
  v === null || v === undefined ? dash : v.toFixed(2);

const fmtInt = (v: number | null | undefined, dash = "—"): string =>
  v === null || v === undefined ? dash : String(Math.round(v));

const decisionLabel = (d: Decision, locale: Locale): string => {
  // The Decision union value is itself a stable English string; we keep
  // it as-is for the EN PDF, and localise just the French version.
  if (locale === "fr") {
    switch (d) {
      case "Promoted":    return "Admis(e)";
      case "Retained":    return "Redouble";
      case "Conditional": return "Conditionnel";
      case "Pending":     return "En attente";
    }
  }
  return d;
};

// ─── Document ─────────────────────────────────────────────────────

const ReportCardDocument = ({
  branding,
  student,
  academicYear,
  termName,
  computed,
  subjectStats,
  remarks = {},
  attendance,
  conduct,
  principalRemark,
  locale = "fr",
}: ReportCardDocumentProps) => {
  const L = LABELS[locale];
  const primary = branding.primaryColor ?? "#1e3a8a";
  const accent  = branding.accentColor  ?? "#3b82f6";
  const s = baseStyles(primary, accent);

  // Subject stats keyed by id for quick lookup inside the row map.
  const statsMap = new Map(subjectStats.map((x) => [x.subjectId, x]));

  // Column widths sum to 100. Tuned for A4 portrait.
  const COL = {
    subject: "22%", coef: "8%", avg: "10%", weighted: "10%",
    classAvg: "10%", min: "8%", max: "8%", remark: "24%",
  };

  const mention = computed.mention as MentionResult | null;
  const mentionDisplay = mention
    ? `${mention.label}${mention.letter ? ` (${mention.letter})` : ""}`
    : L.none;

  return (
    <Document title={`${student.fullName} — ${termName} ${academicYear}`}>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.headerBand}>
          {branding.logoDataUrl && <Image src={branding.logoDataUrl} style={s.logo} />}
          <View style={{ flex: 1 }}>
            <Text style={s.schoolName}>{branding.name}</Text>
            {branding.address && <Text style={s.schoolAddress}>{branding.address}</Text>}
            <Text style={{ ...s.schoolAddress, marginTop: 2 }}>
              {L.year}: {academicYear}   ·   {L.term}: {termName}
            </Text>
          </View>
        </View>
        <Text style={s.reportTitle}>{L.reportCard}</Text>
        <View style={s.accentRule} />

        {/* Student block */}
        <View style={s.studentRow}>
          <View style={s.studentCol}>
            <Text style={s.studentLabel}>{L.student}</Text>
            <Text style={s.studentValue}>{student.fullName}</Text>
          </View>
          <View style={s.studentCol}>
            <Text style={s.studentLabel}>{L.studentId}</Text>
            <Text style={s.studentValue}>{student.studentNumber ?? L.none}</Text>
          </View>
          <View style={s.studentCol}>
            <Text style={s.studentLabel}>{L.class}</Text>
            <Text style={s.studentValue}>{student.className}</Text>
          </View>
          <View style={s.studentCol}>
            <Text style={s.studentLabel}>{L.dob}</Text>
            <Text style={s.studentValue}>{student.dateOfBirth ?? L.none}</Text>
          </View>
          {student.photoDataUrl && (
            <Image src={student.photoDataUrl} style={s.studentPhoto} />
          )}
        </View>

        {/* Subject table */}
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={{ ...s.th, width: COL.subject }}>{L.subject}</Text>
            <Text style={{ ...s.th, width: COL.coef, textAlign: "center" }}>{L.coefficient}</Text>
            <Text style={{ ...s.th, width: COL.avg, textAlign: "center" }}>{L.avg}</Text>
            <Text style={{ ...s.th, width: COL.weighted, textAlign: "center" }}>{L.weighted}</Text>
            <Text style={{ ...s.th, width: COL.classAvg, textAlign: "center" }}>{L.classAvg}</Text>
            <Text style={{ ...s.th, width: COL.min, textAlign: "center" }}>{L.min}</Text>
            <Text style={{ ...s.th, width: COL.max, textAlign: "center" }}>{L.max}</Text>
            <Text style={{ ...s.th, width: COL.remark }}>{L.remark}</Text>
          </View>
          {computed.subjects.map((sub) => {
            const stat = statsMap.get(sub.subjectId);
            return (
              <View key={sub.subjectId} style={s.tr}>
                <Text style={{ ...s.td, width: COL.subject }}>{sub.subjectName}</Text>
                <Text style={{ ...s.td, width: COL.coef, textAlign: "center" }}>{fmtInt(sub.coefficient)}</Text>
                <Text style={{ ...s.td, width: COL.avg, textAlign: "center" }}>{fmt(sub.average)}</Text>
                <Text style={{ ...s.td, width: COL.weighted, textAlign: "center" }}>{fmt(sub.weightedScore)}</Text>
                <Text style={{ ...s.td, width: COL.classAvg, textAlign: "center" }}>{fmt(stat?.classAverage)}</Text>
                <Text style={{ ...s.td, width: COL.min, textAlign: "center" }}>{fmt(stat?.min)}</Text>
                <Text style={{ ...s.td, width: COL.max, textAlign: "center" }}>{fmt(stat?.max)}</Text>
                <Text style={{ ...s.td, width: COL.remark }}>
                  {remarks[sub.subjectId] ?? L.none}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Summary */}
        <View style={s.summaryBand}>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>{L.overall}</Text>
            <Text style={s.summaryValue}>{fmt(computed.overall)}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>{L.rank}</Text>
            <Text style={s.summaryValue}>
              {computed.rank ? `${computed.rank} / ${computed.classSize ?? "—"}` : L.none}
            </Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>{L.mention}</Text>
            <Text style={{ ...s.summaryValue, fontSize: 12 }}>{mentionDisplay}</Text>
          </View>
          <View style={s.summaryCard}>
            <Text style={s.summaryLabel}>{L.decision}</Text>
            <Text style={{ ...s.summaryValue, fontSize: 12 }}>
              {decisionLabel(computed.decision, locale)}
            </Text>
          </View>
        </View>

        {/* Attendance */}
        <View style={s.attRow}>
          <View style={s.attCell}>
            <Text style={s.attNumber}>{attendance.present}</Text>
            <Text style={s.attLabel}>{L.present}</Text>
          </View>
          <View style={s.attCell}>
            <Text style={s.attNumber}>{attendance.absent}</Text>
            <Text style={s.attLabel}>{L.absent}</Text>
          </View>
          <View style={s.attCell}>
            <Text style={s.attNumber}>{attendance.late}</Text>
            <Text style={s.attLabel}>{L.late}</Text>
          </View>
          <View style={s.attCell}>
            <Text style={s.attNumber}>{attendance.excused}</Text>
            <Text style={s.attLabel}>{L.excused}</Text>
          </View>
        </View>

        {/* Conduct + principal remark */}
        {(conduct || principalRemark) && (
          <View style={{ marginTop: 10 }}>
            {conduct && (
              <View style={{ marginBottom: 6 }}>
                <Text style={s.studentLabel}>{L.conduct}</Text>
                <Text style={{ fontSize: 10, marginTop: 1 }}>{conduct}</Text>
              </View>
            )}
            {principalRemark && (
              <View>
                <Text style={s.studentLabel}>{L.principalRemark}</Text>
                <Text style={{ fontSize: 10, marginTop: 1 }}>{principalRemark}</Text>
              </View>
            )}
          </View>
        )}

        {/* Signatures */}
        <View style={s.sigRow}>
          <View style={s.sigCol}><Text style={s.sigLabel}>{L.classTeacher}</Text></View>
          <View style={s.sigCol}><Text style={s.sigLabel}>{L.principal}</Text></View>
          <View style={s.sigCol}><Text style={s.sigLabel}>{L.parent}</Text></View>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text>{branding.name}</Text>
          <Text>
            {L.generated}: {new Date().toLocaleDateString()}
          </Text>
          <Text render={({ pageNumber, totalPages }) =>
            `${L.page} ${pageNumber} ${L.of} ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
};

export default ReportCardDocument;
