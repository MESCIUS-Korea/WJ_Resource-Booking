import { RESOURCE_TYPES } from './constants.js';
import { addDays, addMinutes, makeSeoul, seoulParts, startOfSeoulDay } from './time.js';

// 스케줄러 행 머리글에는 "[유형]" 한 줄 + "이름" 한 줄로 표시한다. (CSS white-space: pre-line 으로 \n 이 줄바꿈이 됨)
const r = (id, type, name, isAvailable, extra = {}) => ({
  id,
  type,
  name,
  label: `${RESOURCE_TYPES[type].tag}\n${name}`,
  isAvailable,
  requiresApproval: false,
  background: RESOURCE_TYPES[type].background,
  foreground: RESOURCE_TYPES[type].foreground,
  ...extra,
});

/** 자원 마스터(읽기 전용). 가상 데이터만 사용합니다. requiresApproval=true 인 자원은 일반 사용자가 확정할 수 없고 관리자 승인이 필요합니다. */
export const RESOURCES = Object.freeze([
  r('EQ-001', 'equipment', 'CNC 가공기 01', true, { location: '공장 A동 · 1라인', equipmentType: 'CNC 가공기' }),
  r('EQ-002', 'equipment', '조립 라인 02', true, { location: '공장 A동 · 2라인', equipmentType: '조립 라인', requiresApproval: true }),
  r('EQ-003', 'equipment', '검사 장비 01', false, { location: '공장 B동 · 품질 연구실', equipmentType: '검사 장비' }),
  r('RM-001', 'room', '회의실 A', true, { location: '본사 3층', capacity: 8 }),
  r('RM-002', 'room', '회의실 B', true, { location: '본사 3층', capacity: 6 }),
  r('RM-003', 'room', '대회의실 C', true, { location: '본사 5층', capacity: 20, requiresApproval: true }),
  r('WK-001', 'worker', '운전원 01', true, { department: '생산팀', role: '설비 운전원', responsibility: 'CNC 가공 셋업 및 운전' }),
  r('WK-002', 'worker', '운전원 02', true, { department: '생산팀', role: '조립 운전원', responsibility: '조립 라인 운영' }),
  r('WK-003', 'worker', '정비 기사 01', true, { department: '설비팀', role: '정비 기사', responsibility: '설비 점검 및 정비' }),
]);

/** 서울 기준 base 의 dayOffset 일 뒤 hh:mm */
function at(base, dayOffset, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const s = seoulParts(addDays(base, dayOffset));
  return makeSeoul(s.y, s.m, s.d, h, m);
}

/**
 * 초기 데이터.
 *  - 예약 24건 (D-2 ~ D+5): 확정 18 · 가예약 4 · 취소 2. 점유 예약끼리는 겹치지 않고, 설비는 완충 15분도 확보되어 있다.
 *  - 가예약은 만료 시각(holdUntil)이 서로 다르다. (2시간 / 26시간 / 50시간 / 72시간 후)
 *  - 차단 3건: 전사 휴무(D+6), CNC 가공기 점검(D+1), 회의실 B 장비 교체(D+2)
 */
export function buildSeed(baseDate, now = baseDate) {
  const D = startOfSeoulDay(baseDate);
  const created = addDays(D, -7);
  const hold = (hours) => addMinutes(now, hours * 60);
  const rows = [
    // id, resource, [d1,t1], [d2,t2], title, by, description, status, attendees, holdHours, needsApproval
    ['BK-001', 'RM-001', [0, '10:00'], [0, '11:00'], '주간 계획 회의', '한지우', '주간 계획 공유 회의', 'confirmed', 6],
    ['BK-002', 'RM-001', [0, '11:00'], [0, '12:00'], '협력사 통화 (미정)', '임서연', '협력사 일정 미확정 통화', 'tentative', 3, 2],
    ['BK-003', 'RM-001', [0, '13:00'], [0, '14:00'], '디자인 리뷰 (취소)', '조현우', '디자인 리뷰 - 취소됨', 'cancelled', 5],
    ['BK-004', 'RM-002', [0, '10:30'], [0, '11:30'], '고객 데모 사전 점검', '윤하나', '고객 데모 사전 점검', 'confirmed', 4],
    ['BK-005', 'EQ-001', [0, '23:30'], [1, '00:30'], '야간 배치 가공', '서민준', '야간 배치 가공 (자정 넘김)', 'confirmed'],
    ['BK-006', 'EQ-001', [0, '08:00'], [0, '10:00'], '공구 보정', '서민준', '공구 보정 작업', 'confirmed'],
    ['BK-007', 'EQ-002', [0, '09:00'], [0, '12:00'], '조립 생산 A-17', '강유나', '제품 A-17 조립 생산', 'confirmed'],
    ['BK-008', 'WK-001', [0, '09:00'], [0, '12:00'], 'CNC 셋업 지원', '서민준', 'CNC 셋업 인력 배정', 'confirmed'],
    ['BK-009', 'WK-002', [0, '13:00'], [0, '17:00'], '라인 02 교대 지원 (미정)', '강유나', '라인 교대 지원 - 미확정', 'tentative', null, 26],
    ['BK-010', 'RM-003', [0, '14:00'], [0, '16:00'], '분기 전체 회의', '한지우', '분기 전체 회의', 'confirmed', 18],
    ['BK-011', 'EQ-001', [-2, '09:00'], [-2, '12:00'], '시제품 절삭', '서민준', '시제품 가공', 'confirmed'],
    ['BK-012', 'EQ-003', [-2, '10:00'], [-2, '11:30'], '입고 검사', '윤하나', '입고 검사 (과거 이력)', 'confirmed'],
    ['BK-013', 'RM-002', [-1, '14:00'], [-1, '15:30'], '회고 회의', '임서연', '스프린트 회고', 'confirmed', 5],
    ['BK-014', 'WK-003', [-1, '09:00'], [-1, '18:00'], '예방 정비', '조현우', '예방 정비 작업', 'confirmed'],
    ['BK-015', 'RM-001', [1, '09:30'], [1, '10:30'], '1:1 멘토링', '임서연', '멘토링 면담', 'confirmed', 2],
    ['BK-016', 'EQ-002', [1, '13:00'], [1, '17:00'], '조립 생산 B-03', '강유나', '제품 B-03 조립 생산', 'confirmed'],
    ['BK-017', 'WK-001', [1, '08:00'], [1, '12:00'], '설비 운전', '서민준', '설비 운전 배정', 'confirmed'],
    ['BK-018', 'RM-003', [2, '10:00'], [2, '12:00'], '파트너 워크숍 (승인 대기)', '윤하나', '파트너 워크숍 - 관리자 승인 대기', 'tentative', 15, 50, true],
    ['BK-019', 'EQ-001', [2, '08:00'], [2, '16:00'], '대량 가공', '서민준', '대량 가공 작업', 'confirmed'],
    ['BK-020', 'WK-002', [3, '09:00'], [3, '13:00'], '포장 지원 (미정)', '강유나', '포장 지원 - 미확정', 'tentative', null, 72],
    ['BK-021', 'RM-002', [3, '15:00'], [3, '16:00'], '예산 검토 (취소)', '조현우', '예산 검토 - 취소됨', 'cancelled', 4],
    ['BK-022', 'WK-003', [4, '10:00'], [4, '15:00'], '라인 점검 지원', '조현우', '라인 점검 지원', 'confirmed'],
    ['BK-023', 'RM-001', [5, '14:00'], [5, '15:00'], '제품 로드맵 논의', '한지우', '제품 로드맵 논의', 'confirmed', 7],
    ['BK-024', 'EQ-002', [5, '09:00'], [5, '11:00'], '조립 생산 C-11', '강유나', '제품 C-11 조립 생산', 'confirmed'],
  ];
  const bookings = rows.map(([id, resourceId, [d1, t1], [d2, t2], title, bookedBy, description, status, attendees, holdHours, needsApproval]) => ({
    id,
    resourceId,
    title,
    startAt: at(D, d1, t1),
    endAt: at(D, d2, t2),
    bookedBy,
    description,
    status,
    note: '',
    attendees: attendees ?? null,
    holdUntil: status === 'tentative' ? hold(holdHours ?? 24) : null,
    needsApproval: !!needsApproval,
    groupId: null,
    seriesId: null,
    seriesIndex: null,
    createdAt: created,
    updatedAt: created,
  }));
  const blocks = [
    { id: 'BL-001', resourceId: null, kind: 'holiday', reason: '전사 휴무(데모)', startAt: at(D, 6, '00:00'), endAt: at(D, 7, '00:00'), createdAt: created },
    { id: 'BL-002', resourceId: 'EQ-001', kind: 'maintenance', reason: '정기 점검', startAt: at(D, 1, '10:00'), endAt: at(D, 1, '12:00'), createdAt: created },
    { id: 'BL-003', resourceId: 'RM-002', kind: 'maintenance', reason: '프로젝터 교체', startAt: at(D, 2, '13:00'), endAt: at(D, 2, '15:00'), createdAt: created },
  ];
  return { bookings, blocks };
}
