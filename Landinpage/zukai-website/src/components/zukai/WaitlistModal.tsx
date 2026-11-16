import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WaitlistForm } from "./WaitlistForm";
import { WAITLIST_EVENT } from "@/lib/waitlist-events";

export function WaitlistModal() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(WAITLIST_EVENT, on);
    return () => window.removeEventListener(WAITLIST_EVENT, on);
  }, []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="glass-card max-w-lg border-border bg-card p-8">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-foreground uppercase">
            Join the waitlist
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Be first to try Zukai when it lands on Android.
          </DialogDescription>
        </DialogHeader>
        <WaitlistForm source="modal" />
      </DialogContent>
    </Dialog>
  );
}
