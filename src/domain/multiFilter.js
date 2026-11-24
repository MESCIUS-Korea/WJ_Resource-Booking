/**
 * 다중 선택 필터 도우미 (유형 · 자원 · 예약자)
 *
 * 규칙: 선택 배열이 비어 있으면 "전체"(필터 없음)입니다.
 *       선택이 있으면 그중 하나라도 일치하면 통과(OR), 다른 필터와는 AND 입니다.
 */

/** 선택이 없으면(또는 배열이 아니면) 전체 */
export const isAll = (sel) => !Array.isArray(sel) || sel.length === 0;

/** value 가 선택 목록에 포함되는지. 선택이 비어 있으면 항상 true */
export const matchesSelection = (sel, value) => isAll(sel) || sel.includes(value);

/** 선택된 유형에 속한 자원만 반환. 유형 선택이 없으면 전체 자원 */
export const resourcesForTypes = (resources, types) =>
  isAll(types) ? resources : resources.filter((r) => types.includes(r.type));

/**
 * 유형이 바뀌면 새 유형에 속하지 않는 자원 선택을 해제한다 (기획서 T12).
 * 기존 reconcileResource(filters, resources) 를 대체한다.
 */
export function reconcileResourceIds(filters, resources) {
  if (isAll(filters.resourceIds)) return filters;
  const allowed = new Set(resourcesForTypes(resources, filters.types).map((r) => r.id));
  const next = filters.resourceIds.filter((id) => allowed.has(id));
  return next.length === filters.resourceIds.length ? filters : { ...filters, resourceIds: next };
}

/**
 * 예약 1건이 유형·자원·예약자 필터를 통과하는지.
 * 기존 필터 함수 안의 type / resourceId / bookedBy 조건 3개를 이 함수로 바꿀 수 있다.
 *   resourceById : Map<resourceId, resource>
 */
export function matchesMultiFilters(booking, filters, resourceById) {
  const type = resourceById.get(booking.resourceId)?.type;
  return (
    matchesSelection(filters.types, type) &&
    matchesSelection(filters.resourceIds, booking.resourceId) &&
    matchesSelection(filters.bookedBy, booking.bookedBy)
  );
}

/** 필터 기본값 (기존 DEFAULT 필터의 type/resourceId/bookedBy 를 이것으로 교체) */
export const EMPTY_MULTI = Object.freeze({ types: [], resourceIds: [], bookedBy: [] });
