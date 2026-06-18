"use client";

import { useI18n } from "@/contexts/LanguageContext";
import { STATUS_STYLE, type RequestStatus } from "@/lib/timeoff";

/** Material-styled status chip with a colored leading dot. The approved
 *  variant carries a check glyph so the requester sees a clear green
 *  confirmation on their dashboard. */
const StatusChip = ({ status }: { status: RequestStatus }) => {
  const { t } = useI18n();
  const s = STATUS_STYLE[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: s.bg, color: s.text }}
    >
      {status === "approved" ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={s.dot} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <span className="inline-block w-2 h-2 rounded-full" style={{ background: s.dot }} />
      )}
      {t(s.labelKey)}
    </span>
  );
};

export default StatusChip;
