export const WAITLIST_EVENT = "zukai:open-waitlist";
export const openWaitlist = () => window.dispatchEvent(new Event(WAITLIST_EVENT));
