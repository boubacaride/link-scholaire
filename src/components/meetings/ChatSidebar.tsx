"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { useI18n } from "@/contexts/LanguageContext";
import { useMeetingChat } from "@/hooks/useMeetingChat";
import { createClient } from "@/lib/supabase/client";

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

interface ChatSidebarProps {
  meetingId: string;
  senderProfileId: string;
}

const ChatSidebar = ({ meetingId, senderProfileId }: ChatSidebarProps) => {
  const { t } = useI18n();
  const { messages, sendMessage, sending } = useMeetingChat(meetingId);
  const [text, setText] = useState("");
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!messages.length) return;
    const supabase = createClient();
    if (!supabase) return;

    const senderIds = Array.from(new Set(messages.map((m) => m.sender_id))).filter(
      (id) => !profiles[id],
    );
    if (!senderIds.length) return;

    supabase
      .from("profiles")
      .select("id, first_name, last_name, avatar_url")
      .in("id", senderIds)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, Profile> = {};
        for (const p of data as Profile[]) map[p.id] = p;
        setProfiles((prev) => ({ ...prev, ...map }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const content = text;
    setText("");
    await sendMessage(content);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-xs text-gray-500">
            {t("labs.chatEmpty")}
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {messages.map((m) => {
            const isOwn = m.sender_id === senderProfileId;
            const author = profiles[m.sender_id];
            const initials = author
              ? `${author.first_name?.[0] ?? ""}${author.last_name?.[0] ?? ""}`
              : "?";
            return (
              <li
                key={m.id}
                className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-medium text-white">
                  {initials}
                </div>
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm ${
                    isOwn ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-100"
                  }`}
                >
                  {!isOwn && author && (
                    <p className="mb-0.5 text-xs font-medium text-gray-300">
                      {author.first_name} {author.last_name}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <p className={`mt-0.5 text-[10px] ${isOwn ? "text-emerald-100" : "text-gray-500"}`}>
                    {new Date(m.created_at).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t border-gray-800 p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("labs.chatPlaceholder")}
          className="flex-1 rounded-lg bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          aria-label={t("labs.chatSend")}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
};

export default ChatSidebar;
