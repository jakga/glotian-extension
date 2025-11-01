import { createClient, SupabaseClient, Session } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const globalScope = globalThis as Record<string, unknown>;
if (!("window" in globalScope)) {
  globalScope.window = globalThis;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Please check .env.local file.",
  );
}

// Create Supabase client with persistent auth storage
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: {
        getItem: async (key: string) => {
          try {
            const result = await chrome.storage.local.get(key);
            return result[key] || null;
          } catch (error) {
            console.error("[Glotian Supabase] Storage getItem error:", error);
            return null;
          }
        },
        setItem: async (key: string, value: string) => {
          const attemptSet = async (
            retriesRemaining: number,
          ): Promise<void> => {
            try {
              await chrome.storage.local.set({ [key]: value });
            } catch (error) {
              if (retriesRemaining > 0) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                return attemptSet(retriesRemaining - 1);
              }
              throw error;
            }
          };

          try {
            await attemptSet(1);
          } catch (error) {
            console.error("[Glotian Supabase] Storage setItem error:", error);
            throw error;
          }
        },
        removeItem: async (key: string) => {
          const attemptRemove = async (
            retriesRemaining: number,
          ): Promise<void> => {
            try {
              await chrome.storage.local.remove(key);
            } catch (error) {
              if (retriesRemaining > 0) {
                await new Promise((resolve) => setTimeout(resolve, 200));
                return attemptRemove(retriesRemaining - 1);
              }
              throw error;
            }
          };

          try {
            await attemptRemove(1);
          } catch (error) {
            console.error(
              "[Glotian Supabase] Storage removeItem error:",
              error,
            );
            throw error;
          }
        },
      },
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Helper function to restore session from storage
export async function restoreSession(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error("[Glotian Supabase] Failed to restore session:", error);
      return null;
    }

    if (data.session) {
      console.log("[Glotian Supabase] Session restored for current user");
      return data.session;
    }

    return null;
  } catch (error) {
    console.error("[Glotian Supabase] Error restoring session:", error);
    return null;
  }
}

// Helper function to clear session
export async function clearSession(): Promise<void> {
  try {
    await supabase.auth.signOut();
    await chrome.storage.local.remove(["supabaseSession", "userId"]);
    console.log("[Glotian Supabase] Session cleared");
  } catch (error) {
    console.error("[Glotian Supabase] Error clearing session:", error);
  }
}

// Helper function to get current user
export async function getCurrentUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  } catch (error) {
    console.error("[Glotian Supabase] Error getting current user:", error);
    return null;
  }
}

// Helper function to check authentication status
export async function isAuthenticated(): Promise<boolean> {
  const session = await restoreSession();
  return session !== null;
}
