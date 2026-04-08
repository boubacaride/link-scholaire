"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserRole } from "@/types";

interface UserContext {
  profileId: string;
  userId: string;
  schoolId: string;
  schoolName: string;
  schoolType: "public" | "private";
  role: UserRole;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
}

interface AuthContextType {
  user: UserContext | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => ({}),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserContext | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchUserContext = async () => {
    try {
      if (!supabase || !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your_supabase')) {
        setUser(null);
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setUser(null);
        return;
      }

      const { data, error } = await supabase.rpc("get_user_context");
      if (error || !data || data.error) {
        setUser(null);
        return;
      }

      setUser({
        profileId: data.profile_id,
        userId: data.user_id,
        schoolId: data.school_id,
        schoolName: data.school_name,
        schoolType: data.school_type,
        role: data.role,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        avatarUrl: data.avatar_url,
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserContext();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        fetchUserContext();
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    await fetchUserContext();
    return {};
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
