import { DEFAULT_RULES } from './constants.js';
import { normalizeColorKey } from './colors.js';
import { DAY, addDays, addMonthsSeoul, floorToMinute, fromInputValue, isValidDate, seoulParts } from './time.js';
import { validateFields, validateSlot } from './validation.js';

const toInt = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Math.trunc(Number(v)) : d);

/**
 * 승인 정책: 승인이 필요한 자원(requiresApproval)을 일반 사용자가 "확정"으로 등록하면 가예약(승인 대기)으로 바뀐다.
 * 관리자는 그대로 확정할 수 있다.
 */
export function effectiveStatus(resource, desired, role) {
  if (desired === 'confirmed' && resource?.requiresApproval && role !== 'admin') return { status: 'tentative', needsApproval: true, forced: true };
  return { status: desired, needsApproval: desired === 'tentative' && !!resource?.requiresApproval, forced: false };
}

export const DEFAULT_REPEAT = { freq: 'none', interval: 1, count: 4, weekdaysOnly: false };

/** 폼 draft(문자열) → 검증용 입력. 초·밀리초는 0으로 정규화한다. */
export function draftToInput(draft) {
  const s = fromInputValue(draft.start);
  const e = fromInputValue(draft.end);
  const ids = [draft.resourceId, ...(draft.extraResourceIds ?? [])].filter(Boolean);
  return {
    title: String(draft.title ?? '').trim(),
    type: draft.type ?? '',
    resourceIds: [...new Set(ids)],
    startAt: isValidDate(s) ? floorToMinute(s) : s,
    endAt: isValidDate(e) ? floorToMinute(e) : e,
    bookedBy: String(draft.bookedBy ?? '').trim(),
    description: String(draft.description ?? '').trim(),
    status: draft.status,
    note: String(draft.note ?? '').trim(),
    attendees: draft.attendees === '' || draft.attendees == null ? null : Number(draft.attendees),
    color: normalizeColorKey(draft.color), // 알 수 없는 값은 '' (기본색)
    repeat: { ...DEFAULT_REPEAT, ...(draft.repeat ?? {}) },
  };
}

/**
 * 반복 규칙 전개 (서울 벽시계 기준, 길이 유지).
 *  - daily  : interval 일 간격. weekdaysOnly 이면 주말을 건너뛴 평일만 count 건
 *  - weekly : interval 주 간격, 같은 요일
 *  - monthly: interval 개월 간격, 같은 일자(해당 월에 없으면 말일로 보정)
 */
export function expandOccurrences(startAt, endAt, repeat = DEFAULT_REPEAT, max = DEFAULT_RULES.maxOccurrences) {
  const dur = endAt.getTime() - startAt.getTime();
  const mk = (s) => ({ startAt: s, endAt: new Date(s.getTime() + dur) });
  const freq = repeat?.freq ?? 'none';
  if (freq === 'none') return [mk(startAt)];
  const count = Math.min(max, Math.max(1, toInt(repeat.count, 1)));
  const interval = Math.max(1, toInt(repeat.interval, 1));
  const out = [];
  if (freq === 'daily') {
    let day = 0;
    for (let guard = 0; out.length < count && guard < count * 10; guard += 1) {
      const s = addDays(startAt, day);
      const dow = seoulParts(s).dow;
      if (!repeat.weekdaysOnly || (dow >= 1 && dow <= 5)) out.push(mk(s));
      day += repeat.weekdaysOnly ? 1 : interval;
    }
  } else if (freq === 'weekly') {
    for (let i = 0; i < count; i += 1) out.push(mk(new Date(startAt.getTime() + i * interval * 7 * DAY)));
  } else if (freq === 'monthly') {
    for (let i = 0; i < count; i += 1) out.push(mk(addMonthsSeoul(startAt, i * interval)));
  }
  return out;
}

/**
 * 예약 계획 평가 (저장하지 않음).
 *  - 반복(회차) × 묶음(자원)을 전개해 회차별·자원별로 검증한다.
 *  - 한 회차 안에서 자원 하나라도 실패하면 그 회차 전체가 실패한다. (묶음은 전부 성공하거나 전부 실패)
 *  - 앞선 회차에서 통과한 예약은 뒤 회차 검증 때 이미 존재하는 것으로 취급한다. (회차끼리 겹치는 반복 방지)
 * opts: { role, displace }
 */
export function planBookings(input, ctx, { role = 'user', displace = false } = {}) {
  const fieldErrors = validateFields(input);
  const ids = input.resourceIds ?? [];
  if (!ids.length) fieldErrors.resourceId = '예약할 자원을 선택하세요.';
  const repeat = input.repeat ?? DEFAULT_REPEAT;
  const max = ctx.rules?.maxOccurrences ?? DEFAULT_RULES.maxOccurrences;
  if (repeat.freq !== 'none') {
    const c = toInt(repeat.count, NaN);
    const i = toInt(repeat.interval, NaN);
    if (!Number.isInteger(c) || c < 2 || c > max) fieldErrors.repeat = `반복 횟수는 2~${max}회로 입력하세요.`;
    else if (!Number.isInteger(i) || i < 1) fieldErrors.repeat = '반복 간격은 1 이상으로 입력하세요.';
  }
  const empty = { fieldErrors, occurrences: [], total: 0, okCount: 0, failCount: 0, allOk: false, single: null, displaceNeeded: false };
  if (!isValidDate(input.startAt) || !isValidDate(input.endAt) || input.startAt >= input.endAt) {
    const slot = validateSlot({ resourceId: ids[0] ?? '', type: input.type, startAt: input.startAt, endAt: input.endAt, status: input.status }, ctx, { role });
    for (const k of ['startAt', 'endAt']) if (slot.errors[k] && !fieldErrors[k]) fieldErrors[k] = slot.errors[k];
    return empty;
  }
  if (!ids.length) return empty;
  const occs = expandOccurrences(input.startAt, input.endAt, fieldErrors.repeat ? DEFAULT_REPEAT : repeat, max);
  let working = ctx.bookings;
  const occurrences = occs.map((o, index) => {
    const items = ids.map((rid) => {
      const res = ctx.resourceMap.get(rid);
      const eff = effectiveStatus(res, input.status, role);
      const candidate = {
        resourceId: rid,
        type: res?.type ?? input.type,
        startAt: o.startAt,
        endAt: o.endAt,
        status: eff.status,
        attendees: input.attendees,
      };
      const v = validateSlot(candidate, { ...ctx, bookings: working }, { role, displace });
      return {
        resourceId: rid,
        candidate,
        needsApproval: eff.needsApproval,
        forcedTentative: eff.forced,
        ok: Object.keys(v.errors).length === 0,
        errors: v.errors,
        conflicts: v.conflicts,
        displaceable: v.displaceable,
        displaces: v.displaces,
      };
    });
    const ok = items.every((i) => i.ok);
    if (ok) {
      const gone = new Set(items.flatMap((i) => i.displaces.map((b) => b.id)));
      if (gone.size) working = working.map((b) => (gone.has(b.id) ? { ...b, status: 'cancelled' } : b));
      working = [
        ...working,
        ...items.map((i) => ({ id: `__plan_${index}_${i.resourceId}`, resourceId: i.resourceId, startAt: o.startAt, endAt: o.endAt, status: i.candidate.status, title: input.title })),
      ];
    }
    return { index, startAt: o.startAt, endAt: o.endAt, ok, items };
  });
  const okCount = occurrences.filter((o) => o.ok).length;
  return {
    fieldErrors,
    occurrences,
    total: occurrences.length,
    okCount,
    failCount: occurrences.length - okCount,
    allOk: okCount === occurrences.length,
    single: occurrences.length === 1 && ids.length === 1 ? occurrences[0].items[0] : null,
    displaceNeeded: occurrences.some((o) => o.items.some((i) => !i.ok && i.displaceable)),
  };
}
