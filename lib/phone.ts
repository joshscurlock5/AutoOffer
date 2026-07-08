/**
 * Live-format a North American phone number to (XXX) XXX-XXXX as the user types.
 *
 * Tolerant of browser autofill / paste that includes the +1 country code. Valid
 * NANP area codes never start with 0 or 1, so a leading "1" on an 11-digit value
 * is always the country code — and since Canada and the US are both +1, we drop
 * it. This stops "quick fill" entries like "+1 703-825-0737" from mangling into
 * "(170) 382-5073". It never REQUIRES the +1: a plain 10-digit number formats the
 * same. Extra digits beyond 10 are ignored.
 *
 * Pair this with a generous (or absent) input maxLength — a tight maxLength lets
 * the browser TRUNCATE an autofilled "+1 …" value before this ever runs, which
 * would drop the last real digit.
 */
export function formatPhone(v: string): string {
  let d = (v || "").replace(/\D/g, "");
  if (d.length === 11 && d[0] === "1") d = d.slice(1); // strip +1 country code
  d = d.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
