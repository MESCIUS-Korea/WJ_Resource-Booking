import { useMemo } from 'react';
import * as wjChart from '@mescius/wijmo.chart';
import WjChart from '../wj/WjChart.jsx';
import WjCombo from '../wj/WjCombo.jsx';
import WjGrid, { esc } from '../wj/WjGrid.jsx';
import Icon from './Icon.jsx';
import { conflictAttempts, hourlyLoad, statusCounts, utilization } from '../domain/analytics.js';
import { RESOURCE_TYPES } from '../domain/constants.js';
import { formatDate, seoulParts } from '../domain/time.js';
import {
  BASE_COLOR, LEGEND_PALETTE, buildResourceColors, confirmedFill, loadTooltip, makeLoadFormatter, makeUtilizationFormatter, safeColor, tentativeStripe, utilizationTooltip,
} from '../utils/chartTheme.js';

const PERIOD_OPTIONS = [
  { value: 'day', label: '일 (표시 중인 날짜)' },
  { value: 'week', label: '주 (표시 중인 주)' },
  { value: 'month', label: '월 (표시 중인 달)' },
];

const clampPct = (v) => Math.max(0, Math.min(100, Number(v) || 0));

// 자원별 수치 표: 자원 색 점 + 가동률 막대. 차트와 같은 자원 색을 쓰고, 확정 = 단색, 가예약 = 같은 색의 대각선 줄무늬.
const UTIL_COLUMNS = [
  { binding: 'nameLabel', header: '자원', width: '2*', minWidth: 170, html: (r) => `<span class="rb-dot" style="background:${confirmedFill(safeColor(r.color))}"></span>${esc(r.nameLabel)}` },
  { binding: 'confirmedHours', header: '확정(h)', width: 90, align: 'center' },
  { binding: 'tentativeHours', header: '가예약(h)', width: 100, align: 'center' },
  { binding: 'availableHours', header: '운영 가능(h)', width: 120, align: 'center' },
  {
    binding: 'totalPct',
    header: '가동률',
    width: '2*',
    minWidth: 200,
    align: 'center',
    html: (r) => {
      const c = clampPct(r.confirmedPct);
      const t = Math.min(100 - c, clampPct(r.tentativePct));
      const base = confirmedFill(safeColor(r.color));
      return (
        `<div class="rb-bar" role="img" aria-label="가동률 ${esc(r.totalPct)}%"><span class="rb-bar__track">` +
        `<i class="rb-bar__c" style="width:${c}%;background:${base}"></i>` +
        `<i class="rb-bar__t" style="width:${t}%;background:${tentativeStripe(base)}"></i>` +
        `</span><em>${esc(r.totalPct)}%</em></div>`
      );
    },
  },
];

function rangeLabel(range, period) {
  if (period === 'month') {
    const s = seoulParts(range.start);
    return `${s.y}년 ${s.m + 1}월`;
  }
  if (period === 'week') return `${formatDate(range.start)} ~ ${formatDate(new Date(range.end.getTime() - 1))}`;
  return formatDate(range.start);
}

/** 이용률 대시보드: 자원별 가동률(확정/가예약 누적), 시간대별 부하(피크), 충돌 시도 집계. 차트는 Wijmo FlexChart, 표는 FlexGrid 로 그린다. */
export default function DashboardTab({ bookings, resources, log, range, period, onPeriodChange }) {
  const util = useMemo(() => utilization(bookings, resources, range), [bookings, resources, range]);
  const hours = useMemo(() => hourlyLoad(bookings, range), [bookings, range]);
  const counts = useMemo(() => statusCounts(bookings, range), [bookings, range]);
  const attempts = useMemo(() => conflictAttempts(log), [log]);
  const colors = useMemo(() => buildResourceColors(resources), [resources]);

  const usable = util.filter((u) => u.isAvailable);
  const avg = usable.length ? Math.round((usable.reduce((s, u) => s + u.totalPct, 0) / usable.length) * 10) / 10 : 0;
  const maxHours = useMemo(() => hours.reduce((m, x) => Math.max(m, x.hours), 0), [hours]);
  const peak = useMemo(() => (maxHours > 0 ? hours.find((x) => x.hours === maxHours) : null), [hours, maxHours]);

  // 차트·표가 같은 자원 색을 쓴다.
  const rows = useMemo(
    () =>
      util.map((u) => ({
        ...u,
        color: colors.get(u.resourceId),
        typeLabel: RESOURCE_TYPES[u.type]?.label ?? '',
        label: `${u.name}${u.isAvailable ? '' : ' (사용 불가)'}`,
        nameLabel: `${u.name}${u.isAvailable ? '' : ' (사용 불가)'}`,
      })),
    [util, colors],
  );

  const symbol = wjChart.ChartElement?.SeriesSymbol;
  const utilFormatter = useMemo(() => makeUtilizationFormatter(symbol), [symbol]);
  const loadFormatter = useMemo(() => makeLoadFormatter(symbol, maxHours), [symbol, maxHours]);
  const loadTip = useMemo(() => loadTooltip(maxHours), [maxHours]);

  const cards = [
    { icon: 'activity', tone: 'primary', label: '평균 가동률', value: `${avg}%`, tip: '사용 가능한 자원의 (확정 + 가예약) 가동률 평균' },
    { icon: 'check-circle', tone: 'accent', label: '확정 / 가예약 / 취소', value: `${counts.confirmed} / ${counts.tentative} / ${counts.cancelled}`, tip: '표시 기간에 걸친 예약 수' },
    { icon: 'clock', tone: 'primary', label: '피크 시간대', value: peak ? `${peak.label} (${peak.hours}h)` : '-', tip: '점유된 자원·시간이 가장 많은 시각' },
    { icon: 'ban', tone: 'warn', label: '충돌 시도 거부', value: `${attempts.total}건`, tip: `겹침 ${attempts.overlap} · 완충 ${attempts.buffer} · 차단 ${attempts.block} (이 세션)` },
  ];

  return (
    <section className="rb-dash" aria-label="이용률 대시보드">
      <div className="rb-dash__bar">
        <div className="rb-inline-field">
          <span>기간</span>
          <WjCombo ariaLabel="대시보드 기간" width={190} value={period} options={PERIOD_OPTIONS} onChange={onPeriodChange} />
        </div>
        <span className="rb-muted">{rangeLabel(range, period)} 기준 · 일정 탭에서 날짜를 옮기면 이 기간도 함께 바뀝니다.</span>
      </div>

      <div className="rb-kpis__grid">
        {cards.map((c) => (
          <div key={c.label} className="rb-kpi" title={c.tip} tabIndex={0} aria-label={`${c.label} ${c.value}. ${c.tip}`}>
            <span className={`rb-kpi__icon rb-kpi__icon--${c.tone}`}><Icon name={c.icon} size={20} /></span>
            <div className="rb-kpi__body">
              <div className="rb-kpi__label">{c.label}</div>
              <div className="rb-kpi__value rb-kpi__value--sm">{c.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rb-dash__grid">
        <div className="rb-card">
          <h2>자원별 가동률 (%)</h2>
          <p className="rb-hint">자원마다 다른 색으로 칠합니다. 진한 색은 확정, 연한 색(테두리 있음)은 가예약이며 막대에 마우스를 올리면 자세한 수치가 나옵니다. 분모는 표시 일수 × 운영 시간(설비 24시간, 회의실·작업자 08~20시)입니다.</p>
          <WjChart
            data={rows}
            bindingX="label"
            type="Column"
            stacking="Stacked"
            series={[{ binding: 'confirmedPct', name: '확정 (진한 색)' }, { binding: 'tentativePct', name: '가예약 (연한 색)' }]}
            palette={LEGEND_PALETTE}
            axisX={{ majorGrid: false }}
            axisY={{ min: 0, max: 100, title: '가동률(%)', majorGrid: true, axisLine: false }}
            tooltip={utilizationTooltip}
            itemFormatter={utilFormatter}
            ariaLabel="자원별 가동률 누적 막대 차트"
            height={320}
          />
        </div>
        <div className="rb-card">
          <h2>시간대별 부하 (점유 자원·시간)</h2>
          <p className="rb-hint">표시 기간 동안 시각별로 점유된 자원 시간의 합입니다. 가장 붐비는 시간은 주황색으로 표시합니다.</p>
          <WjChart
            data={hours}
            bindingX="label"
            type="Column"
            series={[{ binding: 'hours', name: '점유 시간(h)' }]}
            palette={[BASE_COLOR]}
            axisX={{ majorGrid: false }}
            axisY={{ majorGrid: true, axisLine: false,title: '점유 자원·시간(h)' }}
            legend={false}
            tooltip={loadTip}
            itemFormatter={loadFormatter}
            ariaLabel="시간대별 점유 시간 막대 차트"
            height={320}
          />
        </div>
      </div>

      <div className="rb-card">
        <h2>자원별 수치</h2>
        <p className="rb-hint">가동률 막대: 단색은 확정, 줄무늬는 가예약입니다.</p>
        <WjGrid data={rows} columns={UTIL_COLUMNS} ariaLabel="자원별 가동률 표" height={38 + rows.length * 40 + 4} />
      </div>
    </section>
  );
}
