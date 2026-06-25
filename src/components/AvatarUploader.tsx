"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

const ALLOWED = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024;

interface Props {
  currentUrl: string | null;
  /** Initials shown in the placeholder when no avatar is set. */
  initials: string;
  /** Called after a successful upload with the new public URL. */
  onUploaded?: (url: string) => void;
}

/**
 * Avatar upload tile. Stores the file at
 *   avatars/<auth.uid>/<timestamp>-<filename>
 * (RLS in migration 026 enforces "user can only write their own folder"),
 * then writes the public URL back to `profiles.avatar_url` so the rest of
 * the app picks it up via AuthContext on the next session refresh.
 */
const AvatarUploader = ({ currentUrl, initials, onUploaded }: Props) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  const handle = async (file: File) => {
    if (!supabase || !user) return;
    if (!ALLOWED.includes(file.type)) {
      setErr(t("profile.avatarBadType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr(t("profile.avatarTooLarge"));
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.userId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = pub.publicUrl;

      const { error: profErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url })
        .eq("id", user.profileId);
      if (profErr) throw profErr;

      setPreview(url);
      onUploaded?.(url);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!supabase || !user) return;
    setBusy(true);
    setErr(null);
    try {
      await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.profileId);
      setPreview(null);
      onUploaded?.("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start gap-4">
      <div className="relative">
        {preview ? (
          // Plain <img> avoids the next/image `images.remotePatterns` allow-list,
          // since the avatar's public URL lives on the user's Supabase storage host.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Avatar"
            className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-2xl font-bold border-2 border-gray-200">
            {initials}
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center">
            <span className="text-white text-xs">…</span>
          </div>
        )}
      </div>

      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800 mb-0.5">{t("profile.avatar")}</p>
        <p className="text-xs text-gray-500 mb-2">{t("profile.avatarHint")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {preview ? t("profile.changeAvatar") : t("profile.uploadAvatar")}
          </button>
          {preview && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              {t("profile.removeAvatar")}
            </button>
          )}
        </div>
        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED.join(",")}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }}
        />
      </div>
    </div>
  );
};

export default AvatarUploader;
