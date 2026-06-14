"use client";

import React from "react";

/** Light-gray content-header strip, modelled on ProgressBook's content-header:
 *  page title on the left, optional right-aligned info (used by the parent
 *  view to display the selected student's name + ID). Compact by default. */
const PageHeader = ({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) => (
  <div className="bg-gradient-to-b from-[#e8eaec] to-[#d8dce0] border-b border-gray-300 px-4 py-2 flex items-center justify-between">
    <h2 className="text-xl font-bold text-gray-700 leading-tight truncate">{title}</h2>
    {right && <div className="text-right shrink-0 ml-3">{right}</div>}
  </div>
);

export default PageHeader;
