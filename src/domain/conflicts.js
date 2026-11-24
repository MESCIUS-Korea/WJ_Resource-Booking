import { STATUS, occupies } from './constants.js';
import { formatRange } from './time.js';

/** 구간은 모두 반열림 [start, end). 같은 시각에 끝나고 시작하면 겹치지 않는다. */
export const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

export function buildCtx({ resources, bookings, blocks = [], rules }) {
  return { resources, resourceMap: new Map(resources.map((r) => [r.id, r])), bookings, blocks, rules };
}

export const bufferFor = (resource, rules) => Math.max(0, Number(rules?.bufferMinutes?.[resource?.type] ?? 0));

/**
 * 후보 슬롯이 부딪히는 대상을 모두 찾는다. (필터와 무관하게 "전체 원본"을 대상으로 한다)
 *  - overlap : 같은 자원의 점유(확정/가예약) 예약과 시간이 겹침
 *  - buffer  : 겹치지는 않지만 같은 자원 예약과의 간격이 완충 시간보다 짧음
 *  - block   : 점검/휴무 차단(해당 자원 또는 전사)과 겹침
 * 후보가 취소 상태이면 점유하지 않으므로 항상 [] 이다. ignoreIds 는 수정 중인 자기 자신 등을 제외한다.
 */
export function findConflicts(cand, ctx, { ignoreIds = [] } = {}) {
  if (!occupies(cand.status)) return [];
  const ignore = new Set(ignoreIds);
  const res = ctx.resourceMap.get(cand.resourceId);
  const buf = bufferFor(res, ctx.rules) * 60 * 1000;
  const out = [];
  for (const b of ctx.bookings) {
    if (ignore.has(b.id) || b.resourceId !== cand.resourceId || !occupies(b.status)) continue;
    if (overlaps(cand.startAt, cand.endAt, b.startAt, b.endAt)) out.push({ kind: 'overlap', booking: b });
    else if (buf > 0 && overlaps(cand.startAt.getTime() - buf, cand.endAt.getTime() + buf, b.startAt, b.endAt)) {
      out.push({ kind: 'buffer', booking: b });
    }
  }
  for (const bl of ctx.blocks) {
    if (bl.resourceId != null && bl.resourceId !== cand.resourceId) continue;
    if (overlaps(cand.startAt, cand.endAt, bl.startAt, bl.endAt)) out.push({ kind: 'block', block: bl });
  }
  return out;
}

/** 가예약과의 충돌만 있으면 "밀어내기" 후보가 된다. (확정 예약·차단과의 충돌은 밀어낼 수 없음) */
export function partitionConflicts(conflicts) {
  const soft = conflicts.filter((c) => c.kind !== 'block' && c.booking.status === 'tentative');
  const hard = conflicts.filter((c) => !soft.includes(c));
  return { hard, soft };
}

export function describeConflict(c, ctx) {
  if (c.kind === 'block') {
    const where = c.block.resourceId == null ? '전사' : ctx.resourceMap.get(c.block.resourceId)?.name ?? c.block.resourceId;
    return `${where} 차단(${c.block.reason}, ${formatRange(c.block.startAt, c.block.endAt)})과 겹칩니다`;
  }
  const b = c.booking;
  const name = ctx.resourceMap.get(b.resourceId)?.name ?? b.resourceId;
  const label = `${name} ${formatRange(b.startAt, b.endAt)} "${b.title}"(${STATUS[b.status]?.label})`;
  if (c.kind === 'overlap') return `${label} 예약과 겹칩니다`;
  const buf = bufferFor(ctx.resourceMap.get(b.resourceId), ctx.rules);
  return `${label} 예약과의 간격이 완충 시간(${buf}분)보다 짧습니다`;
}

/**
 * 이미 저장된 데이터 중 "확인이 필요한" 예약. 새 차단이 기존 예약과 겹치거나, 정책(완충 시간)이 바뀌어 간격이 부족해진 경우에 생긴다.
 * 반환: Map(bookingId → { level: 'conflict' | 'warning', reasons: string[] })
 *  - conflict : 시간 겹침(예약끼리 또는 차단과)
 *  - warning  : 완충 시간 부족
 */
export function findExistingIssues(ctx) {
  const map = new Map();
  const put = (id, level, reason) => {
    const cur = map.get(id) ?? { level: 'warning', reasons: [] };
    if (level === 'conflict') cur.level = 'conflict';
    cur.reasons.push(reason);
    map.set(id, cur);
  };
  for (const b of ctx.bookings) {
    if (!occupies(b.status)) continue;
    const found = findConflicts(b, ctx, { ignoreIds: [b.id] });
    for (const c of found) put(b.id, c.kind === 'buffer' ? 'warning' : 'conflict', describeConflict(c, ctx));
  }
  return map;
}
