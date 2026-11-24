import { BLOCK_KINDS, occupies } from './constants.js';
import { addDays, fromDateInput, isValidDate, makeSeoul, overlapsDay, seoulParts, startOfSeoulDay } from './time.js';
import { isAll, matchesMultiFilters, matchesSelection, reconcileResourceIds } from './multiFilter.js';

/**
 * 필터 상태
 *  - types / resourceIds / statuses / bookedBy 는 모두 "선택 배열"이며, 빈 배열 = 전체(필터 없음)
 *  - 선택이 있으면 그중 하나라도 일치(OR), 서로 다른 필터끼리는 AND
 */
export const DEFAULT_FILTERS = Object.freeze({
  types: [],
  resourceIds: [],
  statuses: [],
  bookedBy: [],
  text: '',
  dateFrom: '',
  dateTo: '',
});

export const isDefaultFilters = (f) =>
  isAll(f.types) && isAll(f.resourceIds) && isAll(f.statuses) && isAll(f.bookedBy) && !f.text.trim() && !f.dateFrom && !f.dateTo;

/** 두 필터 상태가 같은 조건인지 (조회 버튼의 '변경됨' 표시용) */
const FILTER_KEYS = Object.keys(DEFAULT_FILTERS);
export const sameFilters = (a, b) => FILTER_KEYS.every((k) => JSON.stringify(a?.[k] ?? null) === JSON.stringify(b?.[k] ?? null));

/**
 * 날짜 범위 보정: 시작일이 종료일보다 늦거나, 종료일이 시작일보다 빠른 값은 선택할 수 없게 한다.
 * 방금 바꾼 쪽을 상대 날짜로 맞춘다.
 *   prev : 변경 전 필터 / next : 변경 후 필터
 *   반환 : { filters, adjusted }  adjusted = null | 'from' | 'to' (보정된 쪽)
 */
export function clampDateRange(prev, next) {
  const from = fromDateInput(next.dateFrom);
  const to = fromDateInput(next.dateTo);
  if (!from || !to || from <= to) return { filters: next, adjusted: null };
  if (next.dateFrom !== prev?.dateFrom) return { filters: { ...next, dateFrom: next.dateTo }, adjusted: 'from' };
  return { filters: { ...next, dateTo: next.dateFrom }, adjusted: 'to' };
}

export function filterLanes(resources, f) {
  return resources.filter((r) => matchesSelection(f.types, r.type) && matchesSelection(f.resourceIds, r.id));
}

/** 유형을 바꿨을 때 새 유형에 속하지 않는 자원 선택은 해제한다 (기획서 T12). */
export function reconcileResource(filters, resources) {
  return reconcileResourceIds(filters, resources);
}

/** 필터 결합: 유형·자원·상태·예약자는 각각 내부 OR, 이들과 텍스트·날짜 범위는 AND. 원본은 수정하지 않는다. */
export function applyFilters(bookings, resources, f) {
  const map = new Map(resources.map((r) => [r.id, r]));
  const text = f.text.trim().toLowerCase();
  const from = fromDateInput(f.dateFrom);
  const toDay = fromDateInput(f.dateTo);
  const rangeEnd = toDay ? addDays(toDay, 1) : null;
  return bookings.filter((b) => {
    if (!matchesMultiFilters(b, f, map)) return false; // 유형 · 자원 · 예약자
    if (!matchesSelection(f.statuses, b.status)) return false;
    if (text && !(b.title.toLowerCase().includes(text) || b.description.toLowerCase().includes(text))) return false;
    if (from && b.endAt <= from) return false;
    if (rangeEnd && b.startAt >= rangeEnd) return false;
    return true;
  });
}

/** 표시 구간 [start, end). kind: 'day' | 'week' | 'month' (서울 기준, firstDay 0=일요일) */
export function getViewRange(displayDate, kind, firstDay = 0) {
  const day = startOfSeoulDay(isValidDate(displayDate) ? displayDate : new Date());
  if (kind === 'month') {
    const s = seoulParts(day);
    return { start: makeSeoul(s.y, s.m, 1), end: makeSeoul(s.y, s.m + 1, 1) };
  }
  if (kind === 'week') {
    const dow = new Date(day.getTime() + 9 * 3600 * 1000).getUTCDay();
    const start = addDays(day, -((dow - firstDay + 7) % 7));
    return { start, end: addDays(start, 7) };
  }
  return { start: day, end: addDays(day, 1) };
}

/**
 * 요약 4개. 기준 집합 = (필터 결과) ∩ (표시 구간과 겹치는 예약), 고유 예약 ID 기준.
 * 확인 필요 = 가예약 + 기존 충돌/완충 경고(issues)가 있는 예약
 */
export function computeKpis(filtered, viewRange, now, issues = new Map()) {
  const todayStart = startOfSeoulDay(now);
  const seen = new Set();
  const V = filtered.filter((b) => {
    if (seen.has(b.id) || !(b.startAt < viewRange.end && viewRange.start < b.endAt)) return false;
    seen.add(b.id);
    return true;
  });
  return {
    total: V.length,
    today: V.filter((b) => overlapsDay(b.startAt, b.endAt, todayStart)).length,
    ongoing: V.filter((b) => occupies(b.status) && b.startAt <= now && now < b.endAt).length,
    needsCheck: V.filter((b) => b.status === 'tentative' || issues.has(b.id)).length,
    todayOutOfView: !(todayStart < viewRange.end && viewRange.start < addDays(todayStart, 1)),
  };
}

/**
 * 스케줄러에 전달할 표시용 투영(원본 객체를 컨트롤이 직접 수정하지 않도록 복제).
 * 차단은 별도 항목(kind 'block')으로 그린다. 전사 차단은 표시 중인 모든 레인에 하나씩 그린다.
 */
export function toSchedulerItems({ bookings, blocks, lanes }) {
  const items = bookings.map((b) => ({
    id: b.id,
    kind: 'booking',
    resourceId: b.resourceId,
    title: b.title,
    startAt: new Date(b.startAt.getTime()),
    endAt: new Date(b.endAt.getTime()),
    description: b.description,
    status: b.status,
    bookedBy: b.bookedBy,
    color: b.color ?? '', // 일정 색상 키 ('' = 기본: 자원 유형 색)
    needsApproval: !!b.needsApproval,
    series: !!b.seriesId,
    group: !!b.groupId,
  }));
  const laneIds = new Set(lanes.map((l) => l.id));
  for (const bl of blocks) {
    const targets = bl.resourceId == null ? lanes.map((l) => l.id) : laneIds.has(bl.resourceId) ? [bl.resourceId] : [];
    for (const rid of targets) {
      items.push({
        id: bl.resourceId == null ? `${bl.id}@${rid}` : bl.id,
        kind: 'block',
        blockId: bl.id,
        resourceId: rid,
        title: `${BLOCK_KINDS[bl.kind] ?? '차단'}: ${bl.reason}`,
        startAt: new Date(bl.startAt.getTime()),
        endAt: new Date(bl.endAt.getTime()),
        description: bl.reason,
        status: 'blocked',
        bookedBy: '',
      });
    }
  }
  return items;
}

/** Wijmo nonworkingTime 용: 전사 차단(휴무·전사 점검)만 비근무 시간으로 표시한다. */
export const toNonworkingTime = (blocks) => blocks.filter((b) => b.resourceId == null).map((b) => ({ start: new Date(b.startAt.getTime()), end: new Date(b.endAt.getTime()) }));
