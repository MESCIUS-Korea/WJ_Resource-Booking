/**
 * 일정 색상(범주) 정의.
 *
 * - 예약에는 색상 "키"('yellow' 등)만 저장한다. 빈 문자열이면 기본(자원 유형별 색)을 쓴다.
 * - accent : 태그 아이콘·카드 왼쪽 강조선·색 점에 쓰는 진한 색
 * - bg / fg : 일정 카드 배경(연한 색) / 글자색 (bg 위에서 WCAG AA 4.5:1 이상 확인함)
 *
 * 카드에 칠하는 실제 색은 styles.css 의 .rb-item--c-{key} 규칙이 정한다. (여기 값과 같아야 한다)
 * 키/라벨은 Outlook 기본 범주 순서(노랑·초록·빨강·보라·주황·파랑)를 따른다.
 */
export const EVENT_COLORS = Object.freeze([
  {
    key: 'yellow',
    label: '노란색',
    accent: '#d9a400',
    bg: '#fff3c4',
    fg: '#6b4f00',
  },
  {
    key: 'green',
    label: '녹색',
    accent: '#2e9e4f',
    bg: '#dff3e4',
    fg: '#1a6a32',
  },
  {
    key: 'red',
    label: '빨간색',
    accent: '#d64550',
    bg: '#fbe0e2',
    fg: '#9a1c28',
  },
  {
    key: 'purple',
    label: '자주색',
    accent: '#7a5cc8',
    bg: '#e9e3f8',
    fg: '#4a3590',
  },
  {
    key: 'orange',
    label: '주황색',
    accent: '#e07b39',
    bg: '#fde6d4',
    fg: '#8c4410',
  },
  {
    key: 'blue',
    label: '파란색',
    accent: '#2f8fd3',
    bg: '#dcedfa',
    fg: '#12507f',
  },
]);

const BY_KEY = new Map(EVENT_COLORS.map((c) => [c.key, c]));

/** 키 → 색 정의. 없거나 알 수 없는 키면 null (= 기본색) */
export const colorOf = (key) => BY_KEY.get(key) ?? null;

/** 저장 전 정규화: 알 수 없는 값은 '' (기본) 으로 */
export const normalizeColorKey = (key) => (BY_KEY.has(key) ? key : '');

/** 일정 카드에 붙일 CSS 클래스. 기본(없음)이면 '' */
export const colorClass = (key) => (BY_KEY.has(key) ? `rb-item--c-${key}` : '');
