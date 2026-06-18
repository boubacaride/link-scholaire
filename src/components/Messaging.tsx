"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import { UserRole } from "@/types";

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  avatar_url: string | null;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

interface MessagingProps {
  /** Roles the current user is allowed to start a conversation with.
   *  Defaults are derived from the current user's role. */
  allowedRoles?: UserRole[];
  /** Pre-select a conversation with this profile id on mount. */
  initialContactId?: string;
  /** Outer height; the component manages its own internal scroll. */
  className?: string;
}

const ROLE_LABEL: Record<UserRole, string> = {
  platform_admin: "Admin",
  school_admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
  employee: "Staff",
};

const ROLE_COLOR: Record<UserRole, string> = {
  platform_admin: "bg-gray-100 text-gray-600",
  school_admin: "bg-gray-100 text-gray-600",
  teacher: "bg-blue-100 text-blue-700",
  student: "bg-green-100 text-green-700",
  parent: "bg-orange-100 text-orange-700",
  employee: "bg-indigo-100 text-indigo-700",
};

function defaultAllowedRoles(role: UserRole | undefined): UserRole[] {
  switch (role) {
    case "student":
    case "parent":
      return ["teacher", "school_admin"];
    case "teacher":
    case "school_admin":
    case "platform_admin":
      return ["teacher", "school_admin", "student", "parent"];
    default:
      return ["teacher", "school_admin", "student", "parent"];
  }
}

const ROLE_TKEY: Record<UserRole, string> = {
  platform_admin: "msg.rAdmin", school_admin: "msg.rAdmin",
  teacher: "msg.rTeacher", student: "msg.rStudent", parent: "msg.rParent",
  employee: "msg.rAdmin",
};

const Messaging = ({ allowedRoles, initialContactId, className }: MessagingProps) => {
  const { user } = useAuth();
  const { t } = useI18n();
  const roleLabel = (r: UserRole) => t(ROLE_TKEY[r]);
  const supabase = createClient();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialContactId || null);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showDirectory, setShowDirectory] = useState(false);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const roles = useMemo(
    () => allowedRoles ?? defaultAllowedRoles(user?.role),
    [allowedRoles, user?.role]
  );

  // ── Load the school directory (people you can message) ──────────────
  useEffect(() => {
    const loadContacts = async () => {
      if (!supabase || !user?.schoolId || !user?.profileId) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, role, avatar_url")
        .eq("school_id", user.schoolId)
        .eq("is_active", true)
        .neq("id", user.profileId)
        .in("role", roles)
        .order("first_name", { ascending: true });

      if (data) setContacts(data as Contact[]);
      setLoading(false);
    };
    loadContacts();
  }, [user?.schoolId, user?.profileId, roles.join(",")]);

  // ── Load my messages (and keep polling for live updates) ────────────
  const loadMessages = useCallback(async () => {
    if (!supabase || !user?.profileId) return;
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, recipient_id, body, is_read, created_at")
      .or(`sender_id.eq.${user.profileId},recipient_id.eq.${user.profileId}`)
      .order("created_at", { ascending: true });
    if (data) setMessages(data as ChatMessage[]);
  }, [supabase, user?.profileId]);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 6000);
    return () => clearInterval(interval);
  }, [loadMessages]);

  // ── Mark a conversation read when it is opened ──────────────────────
  const markRead = useCallback(
    async (counterpartId: string) => {
      if (!supabase || !user?.profileId) return;
      const unread = messages.some(
        (m) => m.sender_id === counterpartId && m.recipient_id === user.profileId && !m.is_read
      );
      if (!unread) return;
      await supabase
        .from("messages")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("recipient_id", user.profileId)
        .eq("sender_id", counterpartId)
        .eq("is_read", false);
      setMessages((prev) =>
        prev.map((m) =>
          m.sender_id === counterpartId && m.recipient_id === user.profileId
            ? { ...m, is_read: true }
            : m
        )
      );
    },
    [supabase, user?.profileId, messages]
  );

  useEffect(() => {
    if (selectedId) markRead(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, messages.length]);

  // ── Conversation summaries derived from the message log ─────────────
  const contactsById = useMemo(() => {
    const map = new Map<string, Contact>();
    contacts.forEach((c) => map.set(c.id, c));
    return map;
  }, [contacts]);

  const conversations = useMemo(() => {
    if (!user?.profileId) return [];
    const byCounterpart = new Map<
      string,
      { lastBody: string; lastAt: string; unread: number }
    >();
    for (const m of messages) {
      const other = m.sender_id === user.profileId ? m.recipient_id : m.sender_id;
      const entry = byCounterpart.get(other) || { lastBody: "", lastAt: "", unread: 0 };
      entry.lastBody = m.body;
      entry.lastAt = m.created_at;
      if (m.recipient_id === user.profileId && !m.is_read) entry.unread += 1;
      byCounterpart.set(other, entry);
    }
    return Array.from(byCounterpart.entries())
      .map(([id, info]) => ({ contact: contactsById.get(id), id, ...info }))
      .filter((c) => c.contact)
      .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  }, [messages, user?.profileId, contactsById]);

  const totalUnread = conversations.reduce((sum, c) => sum + c.unread, 0);

  const thread = useMemo(() => {
    if (!selectedId || !user?.profileId) return [];
    return messages.filter(
      (m) =>
        (m.sender_id === user.profileId && m.recipient_id === selectedId) ||
        (m.sender_id === selectedId && m.recipient_id === user.profileId)
    );
  }, [messages, selectedId, user?.profileId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length, selectedId]);

  const selectedContact = selectedId ? contactsById.get(selectedId) : undefined;

  const filteredDirectory = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? contacts.filter((c) =>
          `${c.first_name} ${c.last_name}`.toLowerCase().includes(q)
        )
      : contacts;
    return list;
  }, [contacts, search]);

  // ── Send ────────────────────────────────────────────────────────────
  const send = async () => {
    const body = draft.trim();
    if (!body || !selectedId || !supabase || !user?.profileId || !user?.schoolId) return;
    setSending(true);
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`,
      sender_id: user.profileId,
      recipient_id: selectedId,
      body,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    const { error } = await supabase.from("messages").insert({
      school_id: user.schoolId,
      sender_id: user.profileId,
      recipient_id: selectedId,
      body,
    });
    if (error) {
      // roll back the optimistic bubble on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
    } else {
      loadMessages();
    }
    setSending(false);
  };

  const openConversation = (id: string) => {
    setSelectedId(id);
    setShowDirectory(false);
  };

  const initials = (c?: Contact) =>
    c ? `${c.first_name[0] || ""}${c.last_name[0] || ""}` : "?";

  return (
    <div className={`flex h-[70vh] min-h-[480px] overflow-hidden rounded-xl border bg-white shadow-sm ${className || ""}`}>
      {/* ── Sidebar: conversations + directory ── */}
      <div className={`w-full sm:w-72 border-r flex flex-col ${selectedId ? "hidden sm:flex" : "flex"}`}>
        <div className="p-3 border-b flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-sm">{t("msg.title")}</h2>
            {totalUnread > 0 && (
              <span className="text-[11px] text-blue-600">{t("msg.unread", { n: totalUnread })}</span>
            )}
          </div>
          <button
            onClick={() => setShowDirectory((v) => !v)}
            className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-lg font-medium hover:bg-blue-100 transition-colors"
          >
            {showDirectory ? t("msg.back") : t("msg.new")}
          </button>
        </div>

        {showDirectory && (
          <div className="p-2 border-b">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("msg.searchPeople")}
              className="w-full text-sm px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-400 text-sm">{t("common.loading")}</div>
          ) : showDirectory ? (
            filteredDirectory.length === 0 ? (
              <p className="p-4 text-center text-gray-400 text-sm">{t("msg.noOne")}</p>
            ) : (
              filteredDirectory.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 text-left"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {initials(c)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {c.first_name} {c.last_name}
                    </p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLOR[c.role]}`}>
                      {roleLabel(c.role)}
                    </span>
                  </div>
                </button>
              ))
            )
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-3xl mb-2">💬</div>
              <p className="text-gray-500 text-sm">{t("msg.noConversations")}</p>
              <p className="text-gray-400 text-xs mt-1">{t("msg.tapNew")}</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => openConversation(conv.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-gray-50 hover:bg-gray-50 ${
                  selectedId === conv.id ? "bg-blue-50/60" : ""
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {initials(conv.contact)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {conv.contact!.first_name} {conv.contact!.last_name}
                    </p>
                    {conv.unread > 0 && (
                      <span className="bg-blue-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center shrink-0">
                        {conv.unread}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate">{conv.lastBody}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Thread ── */}
      <div className={`flex-1 flex flex-col ${selectedId ? "flex" : "hidden sm:flex"}`}>
        {!selectedContact ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="text-4xl mb-3">📨</div>
            <p className="text-gray-500 text-sm">{t("msg.selectConversation")}</p>
            <p className="text-gray-400 text-xs mt-1">{t("msg.chooseSomeone")}</p>
          </div>
        ) : (
          <>
            <div className="p-3 border-b flex items-center gap-3">
              <button
                onClick={() => setSelectedId(null)}
                className="sm:hidden text-gray-400 text-lg px-1"
                aria-label="Back"
              >
                ‹
              </button>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                {initials(selectedContact)}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {selectedContact.first_name} {selectedContact.last_name}
                </p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLOR[selectedContact.role]}`}>
                  {roleLabel(selectedContact.role)}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50/60">
              {thread.length === 0 ? (
                <p className="text-center text-gray-400 text-sm mt-8">
                  {t("msg.sayHello")}
                </p>
              ) : (
                thread.map((m) => {
                  const mine = m.sender_id === user?.profileId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                          mine
                            ? "bg-blue-600 text-white rounded-br-sm"
                            : "bg-white border text-gray-800 rounded-bl-sm"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className={`text-[10px] mt-0.5 ${mine ? "text-blue-100" : "text-gray-400"}`}>
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={threadEndRef} />
            </div>

            <div className="p-3 border-t flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={t("msg.typeMessage")}
                className="flex-1 resize-none text-sm px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-200 max-h-28"
              />
              <button
                onClick={send}
                disabled={sending || !draft.trim()}
                className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-xl disabled:opacity-40 hover:bg-blue-700 transition-colors"
              >
                {t("msg.send")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Messaging;
