// Sends the owner a plain-text alert from the connected Gmail account. Server-only.
const OWNER = "niveshjain213@gmail.com";
const GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

const b64 = (s: string) =>
  btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));

export async function notifyOwner(subject: string, body: string) {
  const lovable = process.env["LOVABLE_API_KEY"];
  const gmail = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovable || !gmail) {
    console.error("owner alert skipped: email keys missing");
    return;
  }
  const raw = b64(
    [
      `To: ${OWNER}`,
      `Subject: =?UTF-8?B?${b64(subject)}?=`,
      "MIME-Version: 1.0",
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      body,
    ].join("\r\n"),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const res = await fetch(`${GATEWAY}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": gmail,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) console.error(`owner alert failed [${res.status}]: ${await res.text()}`);
}
