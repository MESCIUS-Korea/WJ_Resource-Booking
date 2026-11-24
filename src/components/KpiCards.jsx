import { formatDate, seoulParts } from '../domain/time.js';
import Icon from './Icon.jsx';

function viewLabel(viewRange, kind) {
  if (kind === 'month') {
    const s = seoulParts(viewRange.start);
    return `${s.y}년 ${s.m + 1}월`;
  }
  if (kind === 'week') return `${formatDate(viewRange.start)} ~ ${formatDate(new Date(viewRange.end.getTime() - 1))}`;
  return formatDate(viewRange.start);
}

export default function KpiCards({ kpis, viewRange, kind, filtersActive, dateFrom, dateTo, onGoToday }) {
  const cards = [
    { key: 'total', icon: 'calendar', tone: 'primary', label: '전체 예약', value: kpis.total, tip: '현재 필터와 표시 기간에 걸친 고유 예약 ID 수 (여러 날짜에 그려진 조각은 1건으로 집계)' },
    { key: 'today', icon: 'clock', tone: 'accent', label: '오늘 예약', value: kpis.today, tip: '표시 집합 중 서울 기준 오늘 00:00~24:00 과 겹치는 예약 수. 취소 포함 여부는 상태 필터에 따릅니다.' },
    { key: 'ongoing', icon: 'activity', tone: 'primary', label: '진행 중', value: kpis.ongoing, tip: '확정/가예약이며 시작 ≤ 현재 < 종료인 예약 수. 실제 수행 상태를 의미하지 않습니다.' },
    { key: 'check', icon: 'alert', tone: 'warn', label: '확인 필요', value: kpis.needsCheck, tip: '가예약이거나, 새 차단·정책 변경으로 충돌/간격 경고가 생긴 예약의 고유 ID 수' },
  ];
  return (
    <section className="rb-kpis" aria-label="예약 요약">
      <p className="rb-kpis__basis">
        현재 필터·표시 기간 기준 · 표시 기간 {viewLabel(viewRange, kind)}
        {(dateFrom || dateTo) && <> · 날짜 필터 {dateFrom || '…'} ~ {dateTo || '…'}</>}
        {filtersActive && ' · 필터 적용 중'}
      </p>
      <div className="rb-kpis__grid">
        {cards.map((c) => (
          <div key={c.key} className="rb-kpi" title={c.tip} tabIndex={0} aria-label={`${c.label} ${c.value}건. ${c.tip}`}>
            <span className={`rb-kpi__icon rb-kpi__icon--${c.tone}`}>
              <Icon name={c.icon} size={20} />
            </span>
            <div className="rb-kpi__body">
              <div className="rb-kpi__label">{c.label}</div>
              <div className="rb-kpi__value">{c.value}</div>
              {c.key === 'today' && kpis.todayOutOfView && (
                <button type="button" className="rb-link-btn" onClick={onGoToday}>오늘로 이동</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
