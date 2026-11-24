// 업무 규칙과 수치는 이 데모의 "제안 설계"이며 Wijmo 기본 동작이 아닙니다.
export const TZ = 'Asia/Seoul';

// 자원 유형 색: 제품 주색(#09868D)·보조색(#2fa9d3)·로고 회색(#697683) 계열의 연한 배경 + 진한 글자
export const RESOURCE_TYPES = {
  equipment: { label: '설비', tag: '[설비]', background: '#e3f3f9', foreground: '#14627f' },
  room: { label: '회의실', tag: '[회의실]', background: '#dff1f2', foreground: '#07666b' },
  worker: { label: '작업자', tag: '[작업자]', background: '#e9edf1', foreground: '#45525e' },
};

export const STATUS = {
  confirmed: { label: '확정', occupies: true },
  tentative: { label: '가예약', occupies: true },
  cancelled: { label: '취소', occupies: false },
};
export const occupies = (status) => STATUS[status]?.occupies === true;

export const ROLES = { user: '일반 사용자', admin: '관리자' };
export const BLOCK_KINDS = { maintenance: '점검', holiday: '휴무' };

export const LIMITS = { title: 100, bookedBy: 50, description: 500, note: 500, reason: 100 };
export const DEFAULT_BOOKER = '데모 예약자';

/** 가동률 계산에 쓰는 유형별 운영 시간(시). [시작, 종료) */
export const OPERATING_HOURS = { equipment: [0, 24], room: [8, 20], worker: [8, 20] };

/** 정책(관리자가 정책 설정에서 변경). 완충 시간은 같은 자원의 예약 사이에 필요한 최소 간격(분). */
export const DEFAULT_RULES = {
  bufferMinutes: { equipment: 15, room: 0, worker: 0 },
  tentativeTtlHours: 24,
  allowDisplace: true,
  suggestionCount: 3,
  suggestionSearchDays: 7,
  suggestStepMinutes: 30,
  /** 대안 시간 제안 가능 시간대(시). 설비는 24시간, 회의실·작업자는 업무 시간만 제안 */
  suggestHours: { equipment: [0, 24], room: [8, 20], worker: [8, 20] },
  maxOccurrences: 30,
};

export const REPEAT_FREQ = [
  { value: 'none', label: '반복 안 함' },
  { value: 'daily', label: '매일' },
  { value: 'weekly', label: '매주' },
  { value: 'monthly', label: '매월' },
];

export const HOUR_OPTIONS = [
  { key: 'all', label: '전체 (00~24시)', start: 0, end: 24 },
  { key: 'extended', label: '확장 (06~24시)', start: 6, end: 24 },
  { key: 'business', label: '업무 (08~20시)', start: 8, end: 20 },
];
export const SCALE_OPTIONS = [
  { key: 70, label: '좁게' },
  { key: 100, label: '보통' },
  { key: 140, label: '넓게' },
  { key: 180, label: '아주 넓게' },
];
export const HEIGHT_OPTIONS = [
  { key: 520, label: '낮게' },
  { key: 640, label: '보통' },
  { key: 820, label: '높게' },
  { key: 1000, label: '아주 높게' },
];
/** 스케줄러 기본 크기. hours: 'all' | 'extended' | 'business', scale: 1시간 칸 가로 폭(px), height: 스케줄러 높이(px) */
export const DEFAULT_LAYOUT = { hours: 'all', scale: 100, height: 640 };
