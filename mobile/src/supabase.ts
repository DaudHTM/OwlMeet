import "react-native-url-polyfill/auto";
import "expo-sqlite/localStorage/install";

import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isDemoMode = !url || !key;

export const supabase = createClient(
  url ?? "https://demo.invalid",
  key ?? "demo-publishable-key",
  {
    auth: {
      storage: localStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  },
);

if (Platform.OS !== "web" && !isDemoMode) {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
