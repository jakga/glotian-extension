/**
 * Authentication component for side panel
 * TODO: Implement full authentication UI in Phase 2 (T029)
 */

import { supabase } from "@/lib/supabase";
import { setSetting, logError } from "@/lib/storage";

/**
 * Handle email/password login
 */
export async function login(
  email: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("[Glotian Auth] Login error:", error);
      return { success: false, error: error.message };
    }

    if (!data.session) {
      return { success: false, error: "No session returned" };
    }

    // Verify user exists before accessing user ID
    if (!data.user) {
      console.error("[Glotian Auth] No user object in response");
      return { success: false, error: "User information unavailable" };
    }

    // Notify background service worker first to avoid inconsistent storage
    try {
      const response = await chrome.runtime.sendMessage({
        type: "AUTH_SUCCESS",
        userId: data.user.id,
        session: data.session,
      });

      if (response?.success === false) {
        return {
          success: false,
          error:
            typeof response.error === "string"
              ? response.error
              : "Failed to sync with background worker",
        };
      }
    } catch (sendError) {
      console.error(
        "[Glotian Auth] Failed to notify background worker:",
        sendError,
      );
      return {
        success: false,
        error: "Failed to sync with background worker",
      };
    }

    // Persist session locally after successful background sync
    await setSetting("userId", data.user.id);
    await setSetting("supabaseSession", data.session);

    console.log("[Glotian Auth] Login successful");
    return { success: true };
  } catch (error) {
    console.error("[Glotian Auth] Login exception:", error);
    await logError("login", error as Error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Handle logout
 */
export async function logout(): Promise<{ success: boolean; error?: string }> {
  try {
    // Sign out from Supabase
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[Glotian Auth] Supabase signOut error:", error);
      return { success: false, error: error.message };
    }

    // Notify background service worker to clear data
    await chrome.runtime.sendMessage({ type: "AUTH_LOGOUT" });

    console.log("[Glotian Auth] Logout successful");
    return { success: true };
  } catch (error) {
    console.error("[Glotian Auth] Logout exception:", error);
    await logError("logout", error as Error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session !== null;
  } catch (error) {
    console.error("[Glotian Auth] Error checking authentication:", error);
    return false;
  }
}
