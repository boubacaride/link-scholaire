"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/contexts/LanguageContext";
import { createClient } from "@/lib/supabase/client";

interface AnnouncementRow {
  id: string;
  title: string;
  description: string;
  created_at: string;
}

const Announcements = () => {
  const { t, locale } = useI18n();
  const supabase = createClient();
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      // RLS scopes the result to the user's school automatically.
      const { data } = await supabase
        .from("announcements")
        .select("id, title, description, created_at")
        .order("created_at", { ascending: false })
        .limit(3);
      setItems((data as AnnouncementRow[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  // Cycle through the three light backgrounds for the cards.
  const cardBg = ["bg-lamaSkyLight", "bg-lamaPurpleLight", "bg-lamaYellowLight"];

  return (
    <div className="bg-white p-4 rounded-md">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("ui.announcements")}</h1>
        <span className="text-xs text-gray-400">{t("ui.viewAll")}</span>
      </div>
      <div className="flex flex-col gap-4 mt-4">
        {loading ? (
          <p className="text-sm text-gray-400">{t("ui.loading")}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400">{t("ui.noAnnouncements")}</p>
        ) : (
          items.map((a, i) => (
            <div key={a.id} className={`${cardBg[i % cardBg.length]} rounded-md p-4`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium truncate">{a.title}</h2>
                <span className="text-xs text-gray-400 bg-white rounded-md px-1 py-1 whitespace-nowrap">
                  {new Date(a.created_at).toLocaleDateString(locale)}
                </span>
              </div>
              {a.description && (
                <p className="text-sm text-gray-400 mt-1">{a.description}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Announcements;
