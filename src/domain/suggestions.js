import { occupies } from './constants.js';
import { findConflicts } from './conflicts.js';
import { MINUTE, minutesOfDay, sameSeoulDay } from './time.js';

/**
 * 충돌 시 대안 시간 제안: 같은 자원·같은 길이로, 요청 시각에 가장 가까운 빈 시간을 찾는다.
 *  - 충돌 판정은 저장과 동일한 findConflicts (겹침·완충·차단 포함)
 *  - 제안 가능 시간대(rules.suggestHours)와 현재 시각 이후만 대상
 * 반환: [{ startAt, endAt, deltaMinutes }] (가까운 순, 같은 거리면 이후 시간 먼저)
 */
export function suggestSlots(cand, ctx, { ignoreIds = [], now = null, count, searchDays, step } = {}) {
  const rules = ctx.rules;
  const res = ctx.resourceMap.get(cand.resourceId);
  if (!res || !occupies(cand.status)) return [];
  const n = count ?? rules.suggestionCount ?? 3;
  const days = searchDays ?? rules.suggestionSearchDays ?? 7;
  const stepMin = step ?? rules.suggestStepMinutes ?? 30;
  const [h0, h1] = rules.suggestHours?.[res.type] ?? [0, 24];
  const dur = cand.endAt.getTime() - cand.startAt.getTime();
  if (!(dur > 0)) return [];

  const fits = (s, e) => {
    if (h0 === 0 && h1 === 24) return true;
    const startMin = minutesOfDay(s);
    const endMin = sameSeoulDay(s, new Date(e.getTime() - 1)) ? minutesOfDay(e) || 24 * 60 : Infinity;
    return startMin >= h0 * 60 && endMin <= h1 * 60;
  };
  const free = (s, e) => {
    if (now && s < now) return false;
    if (!fits(s, e)) return false;
    return findConflicts({ ...cand, startAt: s, endAt: e }, ctx, { ignoreIds }).length === 0;
  };

  const out = [];
  const maxSteps = Math.ceil((days * 24 * 60) / stepMin);
  for (let k = 1; k <= maxSteps && out.length < n; k += 1) {
    for (const dir of [1, -1]) {
      if (out.length >= n) break;
      const s = new Date(cand.startAt.getTime() + dir * k * stepMin * MINUTE);
      const e = new Date(s.getTime() + dur);
      if (free(s, e)) out.push({ startAt: s, endAt: e, deltaMinutes: dir * k * stepMin });
    }
  }
  return out;
}

/** 같은 시간에 비어 있는 같은 유형의 다른 자원(사용 가능·수용 인원 충족)을 제안한다. */
export function suggestResources(cand, ctx, { ignoreIds = [], limit = 5 } = {}) {
  if (!occupies(cand.status)) return [];
  const out = [];
  for (const r of ctx.resources) {
    if (r.id === cand.resourceId || r.type !== cand.type || r.isAvailable === false) continue;
    if (cand.attendees != null && cand.attendees !== '' && r.capacity != null && Number(cand.attendees) > r.capacity) continue;
    if (findConflicts({ ...cand, resourceId: r.id }, ctx, { ignoreIds }).length === 0) out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
