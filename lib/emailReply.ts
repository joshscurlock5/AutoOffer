/**
 * Strip the quoted original from an inbound email reply so only the customer's
 * NEW text shows (like a text message) — not our whole email quoted back under
 * their answer.
 *
 * Handles the common reply styles: Gmail / Apple Mail ("On <date> … wrote:",
 * which may wrap across lines), Outlook ("-----Original Message-----", the
 * underscore rule, and From:/Sent: header blocks), then trims any trailing
 * ">"-quoted lines. Conservative by design: if no delimiter is found it returns
 * the text unchanged, so an ordinary reply is never mangled — callers should
 * fall back to the original text if the stripped result comes back empty.
 *
 * Pure string function (no imports) so both inbound paths — the Gmail Apps
 * Script route and the Resend inbound webhook — can share it.
 */
export function stripQuotedReply(raw: string): string {
  if (!raw) return "";
  const text = raw.replace(/\r\n?/g, "\n");

  const delimiters: RegExp[] = [
    /\n?On\b[\s\S]{0,300}?\bwrote:/, // Gmail / Apple Mail attribution (may wrap)
    /\n-{2,}\s*Original Message\s*-{2,}/i, // Outlook
    /\n_{5,}/, // Outlook underscore separator rule
    /\nFrom:\s.+\n(Sent|Date|To):\s/i, // Outlook forwarded-header block
    /\n[^\n]{0,120}\bwrote:\n(?=\s*>)/, // generic "… wrote:" right before quotes
  ];
  let cut = text.length;
  for (const re of delimiters) {
    const i = text.search(re);
    if (i !== -1 && i < cut) cut = i;
  }

  const body = text.slice(0, cut).split("\n");
  // Drop trailing quoted (">") lines and any blank lines the cut leaves behind.
  while (body.length && (/^\s*>/.test(body[body.length - 1]) || body[body.length - 1].trim() === "")) {
    body.pop();
  }
  return body.join("\n").trim();
}
