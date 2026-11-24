// 차트 색·툴팁 도우미. Wijmo 에 의존하지 않는 순수 함수라서 npm test 로 검증할 수 있다.

/**
 * 자원마다 다르게 쓰는 색. 어둡게 섞어 탁해지지 않도록, 처음부터 "깊고 선명한" 색(명도 30~53%, 채도 높음)을 골랐다.
 * 색상각이 서로 34° 이상 떨어져 있어 나란히 놓아도 구분되고, 회청색(#4F6379)은 중립색이다.
 * 파랑 → 보라 → 청록 → 주황 → 분홍 → 초록 → 연두 → 회청 → 자주 순서. 사용 불가 자원은 색을 소비하지 않고 회색이다.
 */
export const RESOURCE_PALETTE = [
  '#1F6FD1',
  '#6542CE',
  '#0E8A87',
  '#D2601A',
  '#CC2F6A',
  '#228A4E',
  '#58921A',
  '#4F6379',
  '#9333A8',
];
export const UNAVAILABLE_COLOR = '#AAB4BD';
/** 범례용 중립색: 진한 회청색 = 확정, 연한 회청색 = 가예약 */
export const LEGEND_PALETTE = ['#4F6379', '#D9E1E9'];
export const PEAK_COLOR = '#D2601A';
export const BASE_COLOR = '#2FA9D3';

/** 가예약 = 자원 색을 85% 연하게 (막대에는 자원 색의 얇은 테두리를 함께 그려 윤곽을 살린다). */
export const TENTATIVE_TINT = 0.85;
/**
 * 가예약 막대 테두리 두께(px). SVG 테두리는 막대 가장자리에 반씩 걸쳐 그려지므로 두꺼울수록 막대가 실제 값보다 커 보인다.
 * 두께를 바꾸려면 이 값만 고치면 된다. (1 = 권장, 0.5 = 거의 왜곡 없음, 0 = 테두리 없음)
 */
export const TENTATIVE_STROKE = 0.5;

export const escapeHtml = (v) =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const HEX = /^#[0-9a-fA-F]{6}$/;
/** style 속성에 넣을 색은 반드시 #RRGGBB 형식만 허용한다. */
export const safeColor = (c, fallback = '#697683') =>
  typeof c === 'string' && HEX.test(c) ? c : fallback;

const channels = (hex) => {
  const n = parseInt(safeColor(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) =>
  `#${rgb
    .map((x) =>
      Math.max(0, Math.min(255, Math.round(x)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`.toUpperCase();

/** 흰색과 섞어 연하게 만든다. amount 0 = 원래 색, 1 = 흰색 */
export const tint = (hex, amount = 0.55) =>
  toHex(channels(hex).map((v) => v + (255 - v) * amount));
/** 검정과 섞어 어둡게 만든다. amount 0 = 원래 색, 1 = 검정 */
export const shade = (hex, amount = 0.3) =>
  toHex(channels(hex).map((v) => v * (1 - amount)));

/** 확정 = 자원 색 그대로(어둡게 섞지 않는다), 가예약 = 아주 연한 색 */
export const confirmedFill = (hex) => safeColor(hex).toUpperCase();
export const tentativeFill = (hex) => tint(hex, TENTATIVE_TINT);

/** 표 안의 가동률 막대에서 가예약 구간에 쓰는 대각선 줄무늬 배경(CSS). 확정(단색)과 한눈에 구분된다. */
export const tentativeStripe = (hex) =>
  `repeating-linear-gradient(135deg, ${tint(hex, 0.5)} 0 3px, ${tint(
    hex,
    0.86
  )} 3px 6px)`;

/** WCAG 상대 휘도와 명도 대비(1~21). 확정/가예약 색이 충분히 구분되는지 테스트에서 확인한다. */
export function luminance(hex) {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** resources 배열 순서대로 색을 배정한다. 사용 불가 자원은 회색이며 팔레트 순번을 쓰지 않는다. */
export function buildResourceColors(resources) {
  let k = 0;
  return new Map(
    resources.map((r) => {
      if (r.isAvailable === false) return [r.id, UNAVAILABLE_COLOR];
      const c = RESOURCE_PALETTE[k % RESOURCE_PALETTE.length];
      k += 1;
      return [r.id, c];
    })
  );
}

const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
const pct = (v) => `${r1(v).toFixed(1)}%`;
const hrs = (v) => `${r1(v).toFixed(1)}시간`;
const pad2 = (n) => String(n).padStart(2, '0');

/** 히트 테스트 결과에서 데이터 행을 꺼낸다. (item 이 없으면 차트의 컬렉션에서 pointIndex 로 찾는다) */
export function pointItem(ht) {
  return (
    ht?.item ??
    ht?.chart?.collectionView?.items?.[ht?.pointIndex] ??
    ht?.series?.chart?.collectionView?.items?.[ht?.pointIndex] ??
    null
  );
}

/** 자원별 가동률 차트 툴팁(HTML). 호버한 막대의 상태 행을 강조한다. */
export function utilizationTooltip(ht) {
  const d = pointItem(ht);
  if (!d) return '';
  const base = confirmedFill(safeColor(d.color));
  const light = tentativeFill(base);
  const active = ht?.series?.binding;
  const row = (key, label, p, h, fill) =>
    `<tr class="rb-tip__row${
      active === key ? ' is-active' : ''
    }"><td><i class="rb-tip__sw" style="background:${fill};border-color:${base}"></i>${escapeHtml(
      label
    )}</td><td>${pct(p)}</td><td>${hrs(h)}</td></tr>`;
  return (
    `<div class="rb-tip">` +
    `<div class="rb-tip__title"><i class="rb-tip__dot" style="background:${base}"></i>${escapeHtml(
      d.name
    )}${
      d.isAvailable === false
        ? ' <span class="rb-tip__muted">(사용 불가)</span>'
        : ''
    }</div>` +
    `<div class="rb-tip__sub">${escapeHtml(d.typeLabel ?? '')}</div>` +
    `<table class="rb-tip__table"><tbody>` +
    `<tr class="rb-tip__head"><td>구분</td><td>가동률</td><td>시간</td></tr>` +
    row('confirmedPct', '확정', d.confirmedPct, d.confirmedHours, base) +
    row('tentativePct', '가예약', d.tentativePct, d.tentativeHours, light) +
    `<tr class="rb-tip__row rb-tip__total"><td>합계</td><td>${pct(
      d.totalPct
    )}</td><td>${hrs(
      (Number(d.confirmedHours) || 0) + (Number(d.tentativeHours) || 0)
    )}</td></tr>` +
    `</tbody></table>` +
    `<div class="rb-tip__foot">운영 가능 시간 ${hrs(
      d.availableHours
    )} 기준</div>` +
    `</div>`
  );
}

/** 시간대별 부하 차트 툴팁. max 는 가장 붐비는 시간의 값(피크 대비 비율 계산용) */
export function loadTooltip(max) {
  return (ht) => {
    const d = pointItem(ht);
    if (!d) return '';
    const h = Number(d.hours) || 0;
    const isPeak = max > 0 && h === max;
    const ratio = max > 0 ? Math.round((h / max) * 100) : 0;
    return (
      `<div class="rb-tip">` +
      `<div class="rb-tip__title">${pad2(d.hour)}:00 ~ ${pad2(
        (Number(d.hour) + 1) % 24
      )}:00${isPeak ? ' <span class="rb-tip__badge">피크</span>' : ''}</div>` +
      (h > 0
        ? `<div class="rb-tip__line"><span>점유 자원·시간</span><b>${hrs(
            h
          )}</b></div><div class="rb-tip__line"><span>피크 대비</span><b>${ratio}%</b></div>`
        : `<div class="rb-tip__sub">이 시간대에는 예약이 없습니다.</div>`) +
      `</div>`
    );
  };
}

/**
 * 자원별 가동률 막대 색(공식 문서: itemFormatter 에서 engine.fill / engine.stroke / engine.strokeWidth 를 설정한 뒤 기본 렌더러 호출).
 *  - 확정  : 자원 색 그대로, 테두리 없음
 *  - 가예약: 자원 색을 연하게 + 자원 색 얇은 테두리(TENTATIVE_STROKE) → 확정과 구분되고 흰 배경에서도 윤곽이 보인다.
 *            값이 0 인 가예약 막대(높이 0)에는 테두리를 그리지 않는다. (그리면 값이 없는데도 가로선이 보인다)
 * symbol = ChartElement.SeriesSymbol
 */
export function makeUtilizationFormatter(symbol) {
  return (engine, ht, defaultRenderer) => {
    if (ht?.chartElement === symbol && ht.series) {
      const d = pointItem(ht);
      if (d?.color) {
        const base = confirmedFill(d.color);
        const tentative = ht.series.binding === 'tentativePct';
        const hasValue = tentative && Number(d.tentativePct) > 0;
        engine.fill = tentative ? tentativeFill(base) : base;
        engine.stroke = base;
        engine.strokeWidth = hasValue ? TENTATIVE_STROKE : 0;
      }
    }
    defaultRenderer();
  };
}

/** 시간대별 부하 막대 색: 가장 붐비는 시간만 강조색 */
export function makeLoadFormatter(symbol, max) {
  return (engine, ht, defaultRenderer) => {
    if (ht?.chartElement === symbol) {
      const d = pointItem(ht);
      const peak = max > 0 && Number(d?.hours) === max;
      engine.fill = peak ? PEAK_COLOR : BASE_COLOR;
      engine.stroke = peak ? PEAK_COLOR : BASE_COLOR;
    }
    defaultRenderer();
  };
}
