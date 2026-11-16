import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SOCIALS } from "./socials";
import { Search, LayoutGrid, X, Menu, CornerDownLeft } from "lucide-react";
import { Logo } from "./Logo";
import { Asset } from "./Asset";
import { SECTIONS } from "./sections";
import { scrollToId } from "@/lib/scroll";
import { openWaitlist } from "@/lib/waitlist-events";

const circle =
  "flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card transition-colors";

function Socials() {
  return (
    <div className="flex [perspective:400px]">
      {SOCIALS.map(({ label, href, Icon }, i) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className={`${circle} social-flip relative text-foreground ${i ? "-ml-2" : ""}`}
        >
          <Icon className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const items = SECTIONS.filter((s) => s.label.toLowerCase().includes(q.toLowerCase()));
  const go = (id: string) => {
    onClose();
    setTimeout(() => scrollToId(id), 50);
  };
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 px-4 pt-[15vh] backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-label="Search sections"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card"
        initial={{ y: -16, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 text-primary" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && items[0]) go(items[0].id);
            }}
            placeholder="Jump to a section…"
            className="h-14 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={onClose}
            aria-label="Close search"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="p-2">
          {items.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => go(s.id)}
                className="group flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-foreground hover:bg-secondary"
              >
                {s.label}
                <CornerDownLeft className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100" />
              </button>
            </li>
          ))}
          {!items.length && (
            <li className="px-3 py-3 text-sm text-muted-foreground">No matching section</li>
          )}
        </ul>
      </motion.div>
    </motion.div>
  );
}

function FullMenu({ onClose }: { onClose: () => void }) {
  const go = (id: string) => {
    onClose();
    setTimeout(() => scrollToId(id), 50);
  };
  return (
    <motion.div
      role="dialog"
      aria-label="Menu"
      className="fixed inset-0 z-50 overflow-y-auto bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="mx-auto flex min-h-full max-w-7xl flex-col px-[7%] py-6">
        <div className="flex items-center justify-between">
          <Logo />
          <button
            onClick={onClose}
            aria-label="Close menu"
            className={`${circle} text-primary hover:shadow-glow`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid flex-1 items-center gap-10 py-10 md:grid-cols-2">
          <nav className="flex flex-col gap-4">
            {SECTIONS.map((s, i) => (
              <motion.button
                key={s.id}
                onClick={() => go(s.id)}
                initial={{ x: -30, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.05 * i + 0.1 }}
                className="text-left font-display text-hero-sm text-foreground transition-colors hover:text-primary"
              >
                {s.label}
              </motion.button>
            ))}
            <button
              onClick={() => {
                onClose();
                setTimeout(openWaitlist, 80);
              }}
              className="btn-glossy mt-6 w-full rounded-full px-8 py-4 font-semibold tracking-wide sm:w-fit"
            >
              JOIN THE WAITLIST
            </button>
            <div className="mt-6 md:hidden">
              <Socials />
            </div>
          </nav>
          <Asset
            src="/mascot/zuke-hero-float.webp"
            alt="Zuke the Zukai robot waving"
            className="mx-auto hidden w-full max-w-sm md:block"
          />
        </div>
      </div>
    </motion.div>
  );
}

export function Nav() {
  const [search, setSearch] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSearch(false);
        setMenu(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const dashes = [6, 22, 40, 58, 76, 93];
  return (
    <header className="relative z-40">
      <div className="mx-auto grid h-20 max-w-[1920px] grid-cols-[1fr_auto] items-center px-5 md:grid-cols-3 md:px-[7%] lg:h-24">
        <div className="hidden md:block">
          <Socials />
        </div>
        <div className="md:justify-self-center">
          <Logo />
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setSearch(true)}
            aria-label="Search sections"
            className={`${circle} hidden text-primary hover:shadow-glow md:flex`}
          >
            <Search className="h-5 w-5" />
          </button>
          <button
            onClick={() => setMenu(true)}
            aria-label="Open menu"
            className={`${circle} text-primary hover:shadow-glow`}
          >
            <LayoutGrid className="hidden h-5 w-5 md:block" />
            <Menu className="h-5 w-5 md:hidden" />
          </button>
        </div>
      </div>
      <div className="relative h-px bg-border" aria-hidden>
        {dashes.map((l, i) => (
          <span
            key={l}
            className="glow-dash absolute -top-px h-[3px] w-6 rounded-full bg-primary"
            style={{ left: `${l}%`, animationDelay: `${i * 0.45}s` }}
          />
        ))}
      </div>
      <AnimatePresence>
        {search && <SearchOverlay onClose={() => setSearch(false)} />}
        {menu && <FullMenu onClose={() => setMenu(false)} />}
      </AnimatePresence>
    </header>
  );
}
