"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  value: string | null;
  fileName: string | null;
  onChange: (url: string | null, fileName: string | null) => void;
}

const ACCEPT = ".ppt,.pptx,.pdf,.key,.odp,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf";

/**
 * Specialised uploader for PowerPoint / slide decks attached to a lesson.
 * Stored in the same `teacher-content` bucket under a `slides/` sub-folder.
 * Renders an inline preview via Office Web Viewer for PPT/PPTX, or a
 * native iframe for PDF.
 */
const SlidesAttachment = ({ value, fileName, onChange }: Props) => {
  const { user } = useAuth();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const upload = async (file: File) => {
    if (!supabase || !user) return;
    setError(null);
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.schoolId}/${user.profileId}/slides/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("teacher-content").upload(path, file, { upsert: false });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    const { data: signed } = await supabase.storage.from("teacher-content").createSignedUrl(path, 60 * 60 * 24 * 30);
    onChange(signed?.signedUrl ?? path, file.name);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const isPdf = fileName?.toLowerCase().endsWith(".pdf");
  const officeViewer = value && !isPdf
    ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(value)}`
    : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-gray-400 uppercase tracking-wide">
          📊 PowerPoint / Slide Deck (optional)
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null, null)}
            className="text-[11px] text-gray-400 hover:text-red-600"
          >
            Remove
          </button>
        )}
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      {!value ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) upload(e.dataTransfer.files[0]); }}
          className="border-2 border-dashed border-orange-200 bg-orange-50/40 rounded-lg p-6 text-center cursor-pointer hover:bg-orange-50 transition-colors"
        >
          <div className="text-2xl mb-1">📊</div>
          <p className="text-xs font-medium text-orange-700">
            {uploading ? "Uploading slide deck..." : "Upload PowerPoint or PDF slides"}
          </p>
          <p className="text-[11px] text-gray-500 mt-1">.pptx, .ppt, .pdf, .key, .odp</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white">
          <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border-b">
            <span>📊</span>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-0 text-xs font-medium text-orange-800 truncate hover:underline"
            >
              {fileName || "Slide deck"}
            </a>
            <button
              type="button"
              onClick={() => setPreview((v) => !v)}
              className="text-[11px] bg-white border border-orange-200 text-orange-700 px-2.5 py-1 rounded-md hover:bg-orange-100 font-medium"
            >
              {preview ? "Hide preview" : "Preview"}
            </button>
          </div>

          {preview && (
            <div className="bg-gray-900" style={{ height: 420 }}>
              <iframe
                title="Slide preview"
                src={isPdf ? value : officeViewer || value}
                className="w-full h-full"
                allow="fullscreen"
              />
            </div>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
      />
    </div>
  );
};

export default SlidesAttachment;
