"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface UseSupabaseQueryOptions {
  table: string;
  select?: string;
  orderBy?: { column: string; ascending?: boolean };
  filters?: { column: string; value: string | boolean | number }[];
  eq?: { column: string; value: string };
}

export function useSupabaseQuery<T>({
  table,
  select = "*",
  orderBy,
  filters,
  eq,
}: UseSupabaseQueryOptions) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();
      if (!supabase) {
        setLoading(false);
        return;
      }

      let query = supabase.from(table).select(select);

      if (filters) {
        for (const f of filters) {
          query = query.eq(f.column, f.value);
        }
      }

      if (eq) {
        query = query.eq(eq.column, eq.value);
      }

      if (orderBy) {
        query = query.order(orderBy.column, {
          ascending: orderBy.ascending ?? true,
        });
      }

      const { data: result, error: err } = await query;

      if (err) {
        setError(err.message);
      } else {
        setData((result as T[]) || []);
      }
      setLoading(false);
    };

    fetchData();
  }, [table, select, JSON.stringify(orderBy), JSON.stringify(filters), JSON.stringify(eq)]);

  return { data, loading, error };
}
