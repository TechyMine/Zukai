import { useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useServerFn } from "@tanstack/react-start";
import { joinWaitlist } from "@/lib/waitlist.functions";
import { waitlistSchema } from "@/lib/waitlist-schema";

const CONFETTI = Array.from({ length: 18 }, (_, i) => ({
  a: (i / 18) * Math.PI * 2,
  d: 60 + (i % 4) * 22,
  s: 6 + (i % 3) * 3,
}));

export function WaitlistForm({ source }: { source: "modal" | "final-cta" }) {
  const id = useId();
  const join = useServerFn(joinWaitlist);
  const last = useRef(0);
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "joined" | "exists">("idle");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const parsed = waitlistSchema.safeParse({ email, source, website: hp });
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Enter a valid email");
      return;
    }
    const now = Date.now();
    if (now - last.current < 5000) {
      setErr("Please wait a few seconds before trying again.");
      return;
    }
    last.current = now;
    setState("loading");
    try {
      const res = await join({ data: parsed.data });
      if (res.status === "error") {
        setErr(res.message);
        setState("idle");
        return;
      }
      setMsg(res.message);
      setState(res.status);
    } catch {
      setErr("Please check your email and try again.");
      setState("idle");
    }
  }

  if (state === "joined" || state === "exists")
    return (
      <div role="status" className="flex flex-col items-center gap-3 text-center">
        <div className="relative h-32 w-32">
          {state === "joined" &&
            CONFETTI.map((c, i) => (
              <motion.span
                key={i}
                aria-hidden
                className="absolute top-1/2 left-1/2 rounded-sm bg-primary"
                style={{ width: c.s, height: c.s }}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{
                  x: Math.cos(c.a) * c.d,
                  y: Math.sin(c.a) * c.d,
                  opacity: 0,
                  rotate: 200,
                }}
                transition={{ duration: 1.1, ease: "easeOut" }}
              />
            ))}
          <img
            src="/mascot/zuke-thumbs-up.webp"
            alt="Zuke giving a thumbs up"
            width={128}
            height={128}
            className="h-32 w-32 object-contain"
          />
        </div>
        <p className="font-semibold text-foreground">{msg}</p>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="w-full">
      <label htmlFor={`${id}-email`} className="sr-only">
        Email address
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={255}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-invalid={!!err}
          aria-describedby={err ? `${id}-err` : undefined}
          className="h-14 min-w-0 flex-1 rounded-full border border-border bg-background/60 px-6 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={hp}
              onChange={(e) => setHp(e.target.value)}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={state === "loading"}
          className="btn-glossy h-14 rounded-full px-8 font-semibold tracking-wide disabled:opacity-70"
        >
          {state === "loading" ? "JOINING…" : "JOIN THE WAITLIST"}
        </button>
      </div>
      <p id={`${id}-err`} role="alert" className="mt-3 min-h-5 px-2 text-sm text-destructive">
        {err}
      </p>
    </form>
  );
}
