import { DEFAULT_BOOKER } from './constants.js';
import { DEFAULT_REPEAT } from './plan.js';
import { isValidDate, toInputValue } from './time.js';

/** 신규 예약 기본값: 기준일 09:00~10:00, 슬롯(셀·드래그 선택)이 있으면 그 구간 우선 */
export function defaultDraft({ baseDate, type = '', resourceId = '', start, end } = {}) {
  const s = isValidDate(start) ? start : new Date(baseDate.getTime() + 9 * 3600 * 1000);
  const e = isValidDate(end) && end > s ? end : new Date(s.getTime() + 3600 * 1000);
  return {
    title: '',
    type,
    resourceId,
    extraResourceIds: [],
    start: toInputValue(s),
    end: toInputValue(e),
    bookedBy: DEFAULT_BOOKER,
    description: '',
    status: 'confirmed',
    note: '',
    attendees: null,
    color: '', // 일정 색상 키 ('' = 기본: 자원 유형 색)
    repeat: { ...DEFAULT_REPEAT },
  };
}

export function bookingToDraft(b, resources) {
  const res = resources.find((x) => x.id === b.resourceId);
  return {
    title: b.title,
    type: res?.type ?? '',
    resourceId: b.resourceId,
    extraResourceIds: [],
    start: toInputValue(b.startAt),
    end: toInputValue(b.endAt),
    bookedBy: b.bookedBy,
    description: b.description,
    status: b.status,
    note: b.note ?? '',
    attendees: b.attendees ?? null,
    color: b.color ?? '',
    repeat: { ...DEFAULT_REPEAT },
  };
}
