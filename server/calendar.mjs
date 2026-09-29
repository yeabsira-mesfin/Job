// RFC 5545 TEXT values and content lines (75 octets, excluding CRLF).
const escapeText = value => String(value ?? '').replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
function fold(line) {
  let result = '', width = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    if (width + bytes > 75) { result += '\r\n '; width = 1; }
    result += char; width += bytes;
  }
  return result;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function toCalendar(rows, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ApplyFlow//Application deadlines//EN', 'CALSCALE:GREGORIAN'];
  for (const row of rows) {
    if (row.status !== 'saved' || !validDate(row.deadline)) continue;
    lines.push('BEGIN:VEVENT', `UID:application-${encodeURIComponent(row.id)}@applyflow.local`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${row.deadline.replaceAll('-', '')}`, 'DURATION:P1D',
      `SUMMARY:${escapeText(`Apply: ${row.company} — ${row.role}`)}`,
      `DESCRIPTION:${escapeText(`Application deadline for ${row.role} at ${row.company}${row.url ? `\nJob posting: ${row.url}` : ''}`)}`,
      `LOCATION:${escapeText(row.location)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  return lines.map(fold).join('\r\n') + '\r\nEND:VCALENDAR\r\n';
}
