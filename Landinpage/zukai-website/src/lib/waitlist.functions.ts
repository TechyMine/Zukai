import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { waitlistSchema, type WaitlistResult } from "./waitlist-schema";

export const joinWaitlist = createServerFn({ method: "POST" })
  .validator((data: unknown) => waitlistSchema.parse(data))
  .handler(async ({ data }): Promise<WaitlistResult> => {
    if (data.website) return { status: "joined", message: "You're on the list!" };
    const key =
      process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
    if (!key || !url) {
      console.error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in environment");
      return {
        status: "error",
        message: "Waitlist service is temporarily unavailable. Please try again later.",
      };
    }
    const sb = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
            h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { error } = await sb
      .from("waitlist")
      .insert({ email: data.email, source: data.source ?? null });
    if (!error) {
      const { notifyOwner } = await import("./notify-owner.server");
      await notifyOwner(
        `New Zukai waitlist sign-up: ${data.email}`,
        `Someone just joined the Zukai waitlist.\n\nEmail: ${data.email}\nForm: ${data.source ?? "unknown"}\nTime: ${new Date().toISOString()}`,
      ).catch((e) => console.error("owner alert error", e));
      return {
        status: "joined",
        message: "You're on the list! We'll email you when Zukai lands on Android.",
      };
    }
    if (error.code === "23505")
      return { status: "exists", message: "Good news — you're already on the list." };
    console.error("waitlist insert failed", error.code);
    return { status: "error", message: "Something went wrong. Please try again in a moment." };
  });
