// Build the "your shifts this week" emails for a published schedule — pure and
// isomorphic (no Firebase / no I/O), so the publish route just sends what this
// returns and the tests run it under plain node. One email per employee who has
// an assigned shift this week AND an email on file; open (unassigned) shifts are
// skipped, and shifts are sorted by date then start time.

const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

function fmtDate(dateStr) {
  const [y, m, d] = String(dateStr).split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1))
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
function fmtTime(hhmm) {
  const [h, mm] = String(hhmm).split(":").map(Number);
  const ap = h < 12 ? "AM" : "PM";
  return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${ap}`;
}

export function buildScheduleEmails(weekShifts = [], staffById = {}, { weekLabel = "", vendorName = "DuoCount", appUrl = "" } = {}) {
  const byUser = new Map();
  for (const s of weekShifts) {
    if (!s.userId) continue; // open (unassigned) shift — nobody to email
    if (!byUser.has(s.userId)) byUser.set(s.userId, []);
    byUser.get(s.userId).push(s);
  }

  const emails = [];
  for (const [userId, shifts] of byUser) {
    const staff = staffById[userId];
    const to = staff && staff.email;
    if (!to) continue; // no address on file — can't notify
    shifts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start < b.start ? -1 : 1)));

    const rows = shifts.map((s) => `${fmtDate(s.date)} · ${fmtTime(s.start)}–${fmtTime(s.end)}${s.locationName ? ` · ${s.locationName}` : ""}`);
    const subject = `Your ${vendorName} schedule — week of ${weekLabel}`;
    const text = [
      `Hi ${staff.name || ""},`, "",
      `Your shifts for the week of ${weekLabel}:`, "",
      ...rows.map((r) => "  " + r), "",
      appUrl ? `Full schedule: ${appUrl}` : "",
    ].join("\n");
    const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#1a1c2e;max-width:520px">
      <h2 style="margin:0 0 2px">Your schedule</h2>
      <p style="margin:0 0 14px;color:#666">${esc(vendorName)} — week of ${esc(weekLabel)}</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        ${shifts.map((s) => `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e2d9">${esc(fmtDate(s.date))}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e2d9;text-align:right">${esc(fmtTime(s.start))}–${esc(fmtTime(s.end))}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e2d9;color:#666">${esc(s.locationName || "")}</td>
        </tr>`).join("")}
      </table>
      ${appUrl ? `<p style="font-size:13px;margin-top:12px"><a href="${esc(appUrl)}">Open DuoCount →</a></p>` : ""}
    </div>`;

    emails.push({ to, userId, name: staff.name, shifts: shifts.length, subject, text, html });
  }
  return emails;
}
