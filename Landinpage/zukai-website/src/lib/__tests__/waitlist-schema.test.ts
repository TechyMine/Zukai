import { describe, expect, it } from "vitest";
import { waitlistSchema } from "../waitlist-schema";

describe("waitlist email rules", () => {
  it("trims and lowercases the email", () => {
    expect(waitlistSchema.parse({ email: "  Me@Example.COM " }).email).toBe("me@example.com");
  });
  it("rejects an invalid email", () => {
    expect(waitlistSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
  it("rejects emails over 255 characters", () => {
    expect(waitlistSchema.safeParse({ email: `${"a".repeat(250)}@x.com` }).success).toBe(false);
  });
});
