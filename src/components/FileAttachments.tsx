"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface AttachedFile {
  url: string;
  name: string;
  size: number;
}

interface Props {
  value: AttachedFile[];
  onChange: (files: AttachedFile[]) => void;
  /** Mime/extension filter passed to <input accept>. Defaults to `*` (any file). */
  accept?: string;
  /** Storage bucket name. Defaults to the teacher-content bucket. */
  bucket?: string;
  /** Optional sub-folder appended after `<school_id>/<profile_id>`. */
  folder?: string;
  label?: string;
  multiple?: boolean;
}

const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const fileIcon = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext)) return "📕";
  if (["doc", "docx"].includes(ext)) return "📘";
  if (["xls", "xlsx", "csv"].includes(ext)) return "📗";
  if (["ppt", "pptx"].includes(ext)) return "📙";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "🖼️";
  if (["mp4", "mov", "avi", "webm"].includes(ext)) return "🎬";
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "🎵";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
  return "📎";
};

/**
 * Multi-file uploader backed by Supabase Storage. Stores files under
 * `<school_id>/<profile_id>[/<folder>]/<timestamp>-<filename>` so the
 * bucket RLS policies in migration 025 can enforce school isolation.
 */
const FileAttachments = ({
  value, onChange, accept = "*", bucket = "teacher-content",
  folder, label = "Attachments", multiple = true,
}: Props) => {
  const { user } = useAuth();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || !supabase || !user) return;
    setError(null);
    setUploading(true);
    const next: AttachedFile[] = [...value];
    for (const file of Array.from(fileList)) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const parts = [user.schoolId, user.profileId, folder, `${Date.now()}-${safeName}`].filter(Boolean);
      const path = parts.join("/");
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
      if (upErr) { setError(upErr.message); continue; }
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 30);
      next.push({ url: signed?.signedUrl ?? path, name: file.name, size: file.size });
    }
    onChange(next);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</label>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="text-[11px] bg-white border border-gray-200 text-gray-700 px-2.5 py-1 rounded-md hover:bg-gray-50 font-medium disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "+ Add file"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}

      {value.length === 0 ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center text-xs text-gray-400 hover:bg-gray-50 cursor-pointer"
        >
          Drag files here or click to attach — any file type accepted
        </div>
      ) : (
        <ul className="space-y-1.5">
          {value.map((f, i) => (
            <li key={i} className="flex items-center gap-2 px-2.5 py-1.5 border rounded-lg bg-white">
              <span className="text-base">{fileIcon(f.name)}</span>
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 text-xs text-gray-700 hover:text-blue-600 truncate"
              >
                {f.name}
              </a>
              <span className="text-[10px] text-gray-400 shrink-0">{fmtSize(f.size)}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-[11px] text-gray-400 hover:text-red-600"
                title="Remove"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default FileAttachments;
export type { AttachedFile };
