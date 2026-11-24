// Asia/Seoul(UTC+9, 서머타임 없음) 기준 시간 유틸.
// 모든 시각은 "절대 시각(Date)"으로 저장하고, 화면 입력·표시만 서울 기준으로 변환한다.
const OFFSET_MS = 9 * 60 * 60 * 1000;
export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const p2 = (n) => String(n).padStart(2, '0');

export const isValidDate = (d) => d instanceof Date && !Number.isNaN(d.getTime());

export function seoulParts(date) {
  const d = new Date(date.getTime() + OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    d: d.getUTCDate(),
    h: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    dow: d.getUTCDay(),
  };
}

export function makeSeoul(y, m, d, h = 0, mi = 0) {
  return new Date(Date.UTC(y, m, d, h, mi) - OFFSET_MS);
}

export const startOfSeoulDay = (date) => {
  const s = seoulParts(date);
  return makeSeoul(s.y, s.m, s.d, 0, 0);
};
export const addDays = (date, n) => new Date(date.getTime() + n * DAY);
export const addMinutes = (date, n) => new Date(date.getTime() + n * MINUTE);
export const floorToMinute = (date) => new Date(Math.floor(date.getTime() / MINUTE) * MINUTE);
export const minutesOfDay = (date) => {
  const s = seoulParts(date);
  return s.h * 60 + s.mi;
};
export const sameSeoulDay = (a, b) => startOfSeoulDay(a).getTime() === startOfSeoulDay(b).getTime();
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** 같은 벽시계 시각을 유지한 채 n개월 이동. 해당 일이 없으면 말일로 보정한다. */
export function addMonthsSeoul(date, n) {
  const s = seoulParts(date);
  const total = s.y * 12 + s.m + n;
  const y = Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  return makeSeoul(y, m, Math.min(s.d, daysInMonth(y, m)), s.h, s.mi);
}

/** "YYYY-MM-DDTHH:mm" (서울 벽시계 문자열) */
export function toInputValue(date) {
  if (!isValidDate(date)) return '';
  const s = seoulParts(date);
  return `${s.y}-${p2(s.m + 1)}-${p2(s.d)}T${p2(s.h)}:${p2(s.mi)}`;
}

export function fromInputValue(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(str ?? '').trim());
  if (!m) return new Date(NaN);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return new Date(NaN);
  const date = makeSeoul(y, mo - 1, d, h, mi);
  const back = seoulParts(date);
  if (back.y !== y || back.m !== mo - 1 || back.d !== d) return new Date(NaN); // 2월 30일 등 방지
  return date;
}

export function fromDateInput(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(str ?? '').trim())) return null;
  const d = fromInputValue(`${str}T00:00`);
  return isValidDate(d) ? d : null;
}
export const toDateInput = (date) => toInputValue(date).slice(0, 10);

export const formatDate = (d) => {
  const s = seoulParts(d);
  return `${s.m + 1}/${s.d}(${DOW[s.dow]})`;
};
export const formatTime = (d) => {
  const s = seoulParts(d);
  return `${p2(s.h)}:${p2(s.mi)}`;
};
export const formatDateTime = (d) => `${formatDate(d)} ${formatTime(d)}`;

export function formatRange(start, end) {
  if (!isValidDate(start) || !isValidDate(end)) return '-';
  if (sameSeoulDay(start, new Date(end.getTime() - 1))) return `${formatDate(start)} ${formatTime(start)}~${formatTime(end)}`;
  return `${formatDateTime(start)} ~ ${formatDateTime(end)}`;
}

export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

export const overlapsDay = (start, end, dayStart) => start < addDays(dayStart, 1) && dayStart < end;

/** iCalendar UTC 형식: 20261029T010000Z */
export function toIcsUtc(date) {
  const d = new Date(date.getTime());
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
}
