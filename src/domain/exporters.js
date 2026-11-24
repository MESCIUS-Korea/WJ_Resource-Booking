import { BLOCK_KINDS, RESOURCE_TYPES, STATUS } from './constants.js';
import { formatTime, seoulParts, toIcsUtc } from './time.js';

const p2 = (n) => String(n).padStart(2, '0');
const fmt = (d) => {
  const s = seoulParts(d);
  return `${s.y}-${p2(s.m + 1)}-${p2(s.d)} ${formatTime(d)}`;
};

/** CSV/엑셀 수식 주입 방지: 셀이 = + - @ 탭 캐리지리턴으로 시작하면 앞에 작은따옴표를 붙인다. */
const safeCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s;
};
const csvCell = (v) => {
  const s = safeCell(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 을 앞에 붙인 CSV 문자열을 만든다. */
export function bookingsToCsv(bookings, resources) {
  const map = new Map(resources.map((r) => [r.id, r]));
  const head = ['예약번호', '자원유형', '자원', '제목', '시작', '종료', '예약자', '상태', '인원', '목적/설명', '비고', '묶음ID', '반복ID'];
  const rows = bookings.map((b) => {
    const r = map.get(b.resourceId);
    return [
      b.id, RESOURCE_TYPES[r?.type]?.label ?? '', r?.name ?? b.resourceId, b.title, fmt(b.startAt), fmt(b.endAt), b.bookedBy,
      STATUS[b.status]?.label ?? b.status, b.attendees ?? '', b.description, b.note ?? '', b.groupId ?? '', b.seriesId ?? '',
    ];
  });
  return `\uFEFF${[head, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

const icsEscape = (s) => String(s ?? '').replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545: 한 줄은 75옥텟 이하여야 하며, 넘으면 CRLF + 공백으로 접는다. (UTF-8 문자 경계 유지) */
export function foldIcsLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (curBytes + n > limit) {
      out.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74; // 이어지는 줄은 맨 앞 공백 1옥텟을 쓴다
    }
    cur += ch;
    curBytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/** Outlook·Google 캘린더 등에서 가져올 수 있는 iCalendar(.ics). 시각은 UTC 로 기록한다. */
export function bookingsToIcs(bookings, resources, { now = new Date() } = {}) {
  const map = new Map(resources.map((r) => [r.id, r]));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Resource Booking Pro//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:자원 예약'];
  for (const b of bookings) {
    const r = map.get(b.resourceId);
    const status = { confirmed: 'CONFIRMED', tentative: 'TENTATIVE', cancelled: 'CANCELLED' }[b.status] ?? 'CONFIRMED';
    const desc = [`예약자: ${b.bookedBy}`, `상태: ${STATUS[b.status]?.label ?? b.status}`, b.description, b.note].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@resource-booking-pro`,
      `DTSTAMP:${toIcsUtc(now)}`,
      `DTSTART:${toIcsUtc(b.startAt)}`,
      `DTEND:${toIcsUtc(b.endAt)}`,
      `SUMMARY:${icsEscape(`[${r?.name ?? b.resourceId}] ${b.title}`)}`,
      `LOCATION:${icsEscape([r?.name, r?.location].filter(Boolean).join(' · '))}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      `STATUS:${status}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

export const blockLabel = (b) => BLOCK_KINDS[b.kind] ?? '차단';
