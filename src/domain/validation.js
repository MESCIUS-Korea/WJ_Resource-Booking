import { LIMITS, RESOURCE_TYPES, STATUS, occupies } from './constants.js';
import {
  describeConflict,
  findConflicts,
  partitionConflicts,
} from './conflicts.js';
import { isValidDate } from './time.js';

/** 첫 오류로 포커스를 옮기는 순서 */
export const FIELD_ORDER = [
  'title',
  'type',
  'resourceId',
  'startAt',
  'endAt',
  'attendees',
  'bookedBy',
  'description',
  'status',
  'note',
  'repeat',
];

/** 자원·시간과 무관한 필드 검증 (제목·예약자·설명·비고·상태·인원·유형) */
export function validateFields(c) {
  const errors = {};
  const add = (k, m) => {
    if (!errors[k]) errors[k] = m;
  };
  const title = String(c.title ?? '').trim();
  if (!title) add('title', '제목을 입력하세요.');
  else if (title.length > LIMITS.title)
    add('title', `제목은 ${LIMITS.title}자 이내로 입력하세요.`);

  const by = String(c.bookedBy ?? '').trim();
  if (!by) add('bookedBy', '예약자를 입력하세요.');
  else if (by.length > LIMITS.bookedBy)
    add('bookedBy', `예약자는 ${LIMITS.bookedBy}자 이내로 입력하세요.`);

  const desc = String(c.description ?? '').trim();
  if (!desc) add('description', '목적/설명을 입력하세요.');
  else if (desc.length > LIMITS.description)
    add(
      'description',
      `목적/설명은 ${LIMITS.description}자 이내로 입력하세요.`
    );

  if (String(c.note ?? '').trim().length > LIMITS.note)
    add('note', `비고는 ${LIMITS.note}자 이내로 입력하세요.`);
  if (!STATUS[c.status]) add('status', '상태를 선택하세요.');
  if (!c.type || !RESOURCE_TYPES[c.type])
    add('type', '자원 유형을 선택하세요.');

  if (c.attendees != null && c.attendees !== '') {
    const n = Number(c.attendees);
    if (!Number.isInteger(n) || n < 1)
      add('attendees', '참석 인원은 1 이상의 정수로 입력하세요.');
  }
  return errors;
}

/**
 * 자원·시간 슬롯 검증 + 충돌 판정.
 * 순서: 유효 날짜/시작<종료 → 자원 존재·유형 일치 → 자원 사용 가능 → 수용 인원 → 충돌(겹침·완충·차단)
 * opts: { selfId, role, displace }
 * 반환: { errors, conflicts, hard, soft, displaces, displaceable }
 *  - displaceable: 가예약과만 충돌하고 관리자가 밀어낼 수 있는 상태
 *  - displaces   : displace=true 로 통과시킨 경우 취소 대상이 되는 가예약 목록
 */
export function validateSlot(
  c,
  ctx,
  { selfId = null, role = 'user', displace = false } = {}
) {
  const errors = {};
  const add = (k, m) => {
    if (!errors[k]) errors[k] = m;
  };
  const startOk = isValidDate(c.startAt);
  const endOk = isValidDate(c.endAt);
  if (!startOk) add('startAt', '시작 일시를 올바르게 입력하세요.');
  if (!endOk) add('endAt', '종료 일시를 올바르게 입력하세요.');
  if (startOk && endOk && c.startAt >= c.endAt)
    add('endAt', '종료 일시는 시작 일시보다 늦어야 합니다.');

  const res = ctx.resourceMap.get(c.resourceId);
  if (!c.resourceId) add('resourceId', '예약할 자원을 선택하세요.');
  else if (!res) add('resourceId', '존재하지 않는 자원입니다.');
  else if (c.type && res.type !== c.type)
    add('resourceId', '선택한 자원이 자원 유형과 일치하지 않습니다.');
  else if (res.isAvailable === false && occupies(c.status)) {
    add(
      'resourceId',
      `${res.name}은(는) 현재 사용할 수 없는 자원입니다. 다른 자원을 선택하세요.`
    );
  }

  if (
    res &&
    c.attendees != null &&
    c.attendees !== '' &&
    res.capacity != null &&
    Number(c.attendees) > res.capacity
  ) {
    add(
      'attendees',
      `${res.name}의 수용 인원(${res.capacity}명)을 초과합니다. 더 큰 자원을 선택하세요.`
    );
  }

  let conflicts = [];
  let hard = [];
  let soft = [];
  let displaces = [];
  let displaceable = false;
  if (!errors.startAt && !errors.endAt && !errors.resourceId && res) {
    conflicts = findConflicts(c, ctx, { ignoreIds: selfId ? [selfId] : [] });
    ({ hard, soft } = partitionConflicts(conflicts));
    const policyOk =
      ctx.rules?.allowDisplace !== false && c.status === 'confirmed';
    displaceable =
      hard.length === 0 && soft.length > 0 && policyOk && role === 'admin';
    if (hard.length === 0 && soft.length > 0 && displace && displaceable) {
      displaces = [
        ...new Map(soft.map((s) => [s.booking.id, s.booking])).values(),
      ];
    } else if (conflicts.length > 0) {
      const first = describeConflict(hard[0] ?? soft[0], ctx);
      const more = conflicts.length > 1 ? ` 외 ${conflicts.length - 1}건` : '';
      let tail = ' 시간을 변경하거나 다른 자원을 선택하세요.';
      if (hard.length === 0 && soft.length > 0) {
        if (displaceable) tail = ' 가예약이라 관리자가 밀어낼 수 있습니다.';
        else if (c.status === 'confirmed' && ctx.rules?.allowDisplace !== false)
          tail = ' 가예약이지만 관리자만 밀어낼 수 있습니다.';
      }
      add('resourceId', `${first}${more}.${tail}`);
      add(
        'startAt',
        '같은 자원의 다른 예약·차단과 시간이 겹치거나 완충 시간이 부족합니다.'
      );
    }
  }
  return { errors, conflicts, hard, soft, displaces, displaceable };
}

/** 필드 + 슬롯 검증을 한 번에 (수정·이동·상태 변경에 사용) */
export function validateCandidate(c, ctx, opts = {}) {
  const f = validateFields(c);
  const s = validateSlot(c, ctx, opts);
  const errors = { ...s.errors, ...f };
  for (const k of Object.keys(s.errors)) if (!f[k]) errors[k] = s.errors[k];
  const keys = Object.keys(errors);
  return {
    ok: keys.length === 0,
    errors,
    conflicts: s.conflicts,
    hard: s.hard,
    soft: s.soft,
    displaces: s.displaces,
    displaceable: s.displaceable,
    firstField: FIELD_ORDER.find((k) => errors[k]) ?? keys[0] ?? null,
  };
}
