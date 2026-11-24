import { floorToMinute, isValidDate, startOfSeoulDay } from './time.js';

/**
 * Wijmo itemChanging 의 요청(args.request.values)을 예약 슬롯으로 해석한다.
 * 공식 문서: 이동 요청에는 대상 시작·종료 시각과 대상 레인의 리소스 필드가 들어 있고, 크기 조정은 한쪽 가장자리만 바뀐다.
 * 키 이름은 소스 항목 기준(startAt/endAt)을 우선하고, 이벤트 필드 이름(start/end)도 함께 허용한다.
 *
 * viewKind:
 *  - 'day' | 'week' : 시간 뷰. values 의 시작/종료를 그대로 사용 (한쪽만 있으면 나머지는 기존 값 유지 = 크기 조정)
 *  - 'month'        : 요약 뷰(크기 조정 불가). 다른 날짜 칸으로 옮기면 기존 시각·길이를 유지한 채 날짜만 바꾼다.
 */
export function resolveMove(existing, values = {}, { viewKind = 'day' } = {}) {
  const s = values.startAt ?? values.start;
  const e = values.endAt ?? values.end;
  let rid = values.resourceId;
  if (Array.isArray(rid)) rid = rid[0];
  if (rid == null || rid === '') rid = existing.resourceId;

  const dur = existing.endAt.getTime() - existing.startAt.getTime();
  let start = existing.startAt;
  let end = existing.endAt;
  if (viewKind === 'month') {
    if (isValidDate(s)) {
      const timeOfDay = existing.startAt.getTime() - startOfSeoulDay(existing.startAt).getTime();
      start = new Date(startOfSeoulDay(s).getTime() + timeOfDay);
      end = new Date(start.getTime() + dur);
    }
  } else if (isValidDate(s) && isValidDate(e)) {
    start = s;
    end = e;
  } else if (isValidDate(s)) {
    start = s;
  } else if (isValidDate(e)) {
    end = e;
  }
  return { startAt: floorToMinute(start), endAt: floorToMinute(end), resourceId: rid };
}
