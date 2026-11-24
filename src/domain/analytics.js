import { OPERATING_HOURS, occupies } from './constants.js';
import { DAY, HOUR, addDays, startOfSeoulDay } from './time.js';

const clipMs = (s, e, a, b) => Math.max(0, Math.min(e, b) - Math.max(s, a));

/**
 * 자원별 가동률. 분모 = 표시 구간의 일수 × 유형별 운영 시간(OPERATING_HOURS), 분자 = 그 시간대와 겹치는 점유 예약 시간.
 * 확정/가예약을 나눠 계산하므로 누적 막대(확정 + 가예약)로 그릴 수 있다.
 */
export function utilization(bookings, resources, range) {
  const days = Math.max(1, Math.round((range.end - range.start) / DAY));
  return resources.map((r) => {
    const [h0, h1] = OPERATING_HOURS[r.type] ?? [0, 24];
    const availableMs = days * (h1 - h0) * HOUR;
    let confirmed = 0;
    let tentative = 0;
    for (const b of bookings) {
      if (b.resourceId !== r.id || !occupies(b.status)) continue;
      if (!(b.startAt < range.end && range.start < b.endAt)) continue;
      let ms = 0;
      for (
        let d = startOfSeoulDay(
          new Date(Math.max(b.startAt.getTime(), range.start.getTime()))
        );
        d < range.end && d < b.endAt;
        d = addDays(d, 1)
      ) {
        const wStart = d.getTime() + h0 * HOUR;
        const wEnd = d.getTime() + h1 * HOUR;
        ms += clipMs(
          Math.max(b.startAt.getTime(), range.start.getTime()),
          Math.min(b.endAt.getTime(), range.end.getTime()),
          wStart,
          wEnd
        );
      }
      if (b.status === 'confirmed') confirmed += ms;
      else tentative += ms;
    }
    const pct = (ms) =>
      availableMs > 0 ? Math.round((ms / availableMs) * 1000) / 10 : 0;
    return {
      resourceId: r.id,
      name: r.name,
      type: r.type,
      isAvailable: r.isAvailable,
      confirmedPct: pct(confirmed),
      tentativePct: pct(tentative),
      totalPct: pct(confirmed + tentative),
      confirmedHours: Math.round((confirmed / HOUR) * 10) / 10,
      tentativeHours: Math.round((tentative / HOUR) * 10) / 10,
      availableHours: Math.round((availableMs / HOUR) * 10) / 10,
    };
  });
}

/** 시간대별 부하: 표시 구간 동안 시각(0~23시)별로 점유된 "자원·시간" 합계(시간 단위). 피크 시간대를 찾는 데 쓴다. */
export function hourlyLoad(bookings, range) {
  const buckets = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${String(h).padStart(2, '0')}시`,
    hours: 0,
  }));
  for (const b of bookings) {
    if (!occupies(b.status)) continue;
    const s = Math.max(b.startAt.getTime(), range.start.getTime());
    const e = Math.min(b.endAt.getTime(), range.end.getTime());
    if (e <= s) continue;
    // 서울 시각 정각 단위(= UTC 정각 단위, 오프셋이 정수 시간)로 순회
    for (let t = Math.floor(s / HOUR) * HOUR; t < e; t += HOUR) {
      const overlap = clipMs(s, e, t, t + HOUR);
      if (overlap > 0)
        buckets[new Date(t + 9 * HOUR).getUTCHours()].hours += overlap / HOUR;
    }
  }
  return buckets.map((x) => ({ ...x, hours: Math.round(x.hours * 10) / 10 }));
}

export function statusCounts(bookings, range) {
  const c = { confirmed: 0, tentative: 0, cancelled: 0 };
  for (const b of bookings)
    if (b.startAt < range.end && range.start < b.endAt) c[b.status] += 1;
  return c;
}

/** 변경 이력에서 충돌로 거부된 시도 집계: { total, overlap, buffer, block } */
export function conflictAttempts(log) {
  const out = { total: 0, overlap: 0, buffer: 0, block: 0 };
  for (const e of log) {
    if (e.type !== 'rejected') continue;
    out.total += 1;
    for (const k of e.meta?.kinds ?? []) if (k in out) out[k] += 1;
  }
  return out;
}
