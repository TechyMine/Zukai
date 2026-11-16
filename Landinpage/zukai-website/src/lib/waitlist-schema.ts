import { z } from "zod";

export const waitlistSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Enter your email")
    .max(255, "That email is too long")
    .email("Enter a valid email"),
  source: z.enum(["modal", "final-cta"]).optional(),
  website: z.string().max(200).optional(), // honeypot: real people leave this empty
});
export type WaitlistInput = z.input<typeof waitlistSchema>;
export type WaitlistResult = { status: "joined" | "exists" | "error"; message: string };
