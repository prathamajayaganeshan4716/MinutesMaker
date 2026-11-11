export function attendanceSummary(records) {
  const unavailable = { present: null, absent: null, status: 'UNAVAILABLE' };
  if (!Array.isArray(records)) return unavailable;
  const identities = new Set();
  for (const record of records) {
    if (!record || !record.joinedAt) return unavailable;
    const field = ['uid', 'email', 'displayName'].find((key) => typeof record[key] === 'string' && record[key].trim());
    if (!field) return unavailable;
    identities.add(`${field}:${field === "uid" ? record[field].trim() : record[field].trim().toLowerCase()}`);
  }
  const present = identities.size;
  return present > 22 ? unavailable : { present, absent: 22 - present, status: present >= 13 ? 'QUORUM MET' : 'QUORUM NOT MET' };
}
function date(value) {
  try {
    const d = value?.toDate ? value.toDate() : value == null ? null : new Date(value);
    return d && Number.isFinite(d.getTime()) ? d : null;
  } catch { return null; }
}
export function meetingMetadata(meeting) {
  const format = (v, options) => {
    const d = date(v);
    return d ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...options }).format(d) : 'Not available';
  };
  const start = date(meeting.startedAt), end = date(meeting.endedAt);
  return {
    title: typeof meeting.title === 'string' && meeting.title.trim() ? meeting.title.trim() : 'Not available',
    date: format(meeting.scheduledAt, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    commenced: start ? `${format(start, { hour: 'numeric', minute: '2-digit' })} IST` : 'Not available',
    adjourned: end && (!start || end >= start) ? `${format(end, { hour: 'numeric', minute: '2-digit' })} IST` : 'Not available',
    host: typeof meeting.hostName === 'string' && meeting.hostName.trim() ? meeting.hostName.trim() : 'Not available',
  };
}
const escape = (text) => String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export function boardMinutesHtml(meeting, records, transcript, logo = '/brand/matrix-header.jpg') {
  const m = meetingMetadata(meeting), a = attendanceSummary(records);
  const count = (n) => n == null ? 'Not available' : `${n} Members`;
  const sections = [['Executive Summary', meeting.summary], ['Agenda', meeting.agenda], ['Key Decisions', meeting.decisions], ['Action Items', meeting.actionItems], ['Conclusion', meeting.conclusion], ['Full Transcript', transcript || 'No transcript recorded.']];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(m.title)} — Minutes</title><style>
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; } body { margin:0; color:#000; background:#fff; font:12pt 'Times New Roman',serif; }
.page-border { position:fixed; inset:0; border:1.3pt solid #000; pointer-events:none; }
.cover { min-height:260mm; padding:9mm 12mm 12mm; break-after:page; }
.logo { display:block; width:140mm; height:40mm; object-fit:contain; margin:0 auto; }
h1 { text-align:center; font-size:13pt; margin:18mm 0 18mm; }
dl { margin:0; } dl div { margin:0 0 3.5mm; overflow-wrap:anywhere; } dt,dd { display:inline; margin:0; } dt { font-weight:bold; }
h2 { font-size:13pt; margin:14mm 0 12mm; } table { border-collapse:collapse; width:88mm; margin:0 auto; table-layout:fixed; font-size:12pt; }
th,td { border:1pt solid #000; text-align:center; padding:3mm 2mm; overflow-wrap:anywhere; } tr:last-child { font-weight:bold; }
.content { padding:8mm 12mm; } .content h2 { margin:8mm 0 4mm; break-after:avoid; } p { white-space:pre-wrap; overflow-wrap:anywhere; line-height:1.4; }
@media screen { body { max-width:182mm; margin:12mm auto; } .page-border { display:none; } .cover { border:1pt solid #000; } }
</style></head><body><div class="page-border"></div><section class="cover"><img class="logo" src="${escape(logo)}" alt="MATRIX"><h1>OFFICIAL BOARD MEETING MINUTES</h1><dl>${[['Meeting Type', m.title], ['Date', m.date], ['Time Commenced', m.commenced], ['Time Adjourned', m.adjourned], ['Presiding Officer', m.host]].map(([label, value]) => `<div><dt>${label}: </dt><dd>${escape(value)}</dd></div>`).join('')}</dl><h2>SECTION 1 — ATTENDANCE &amp; QUORUM</h2><table><thead><tr><th>Parameter</th><th>Details</th></tr></thead><tbody>${[['Total Board Strength', '22 Members'], ['Quorum Requirement', 'Minimum 13 Members'], ['Members Present', count(a.present)], ['Members Absent', count(a.absent)], ['Quorum Status', a.status]].map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join('')}</tbody></table></section><main class="content">${sections.filter(([, value]) => value && value !== 'N/A').map(([heading, value]) => `<h2>${heading}</h2><p>${escape(value)}</p>`).join('')}</main></body></html>`;
}
export function printBoardMinutes(meeting, records, transcript) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Allow pop-ups to export the PDF.');
  popup.document.open();
  popup.document.write(boardMinutesHtml(meeting, records, transcript, `${window.location.origin}/brand/matrix-header.jpg`));
  popup.document.close();
  popup.onload = async () => {
    await Promise.all([...popup.document.images].map((img) => img.decode().catch(() => {})));
    popup.focus();
    popup.print();
  };
}
