import { useMemo, useState } from 'react';
import WjGrid, { esc } from '../wj/WjGrid.jsx';
import Icon from './Icon.jsx';
import { iconSvg } from './icons.js';
import { formatDate, formatTime } from '../domain/time.js';

/** 이력 유형별 라벨·아이콘·색조. tone: ok(초록) / info(주색) / warn(주황) / danger(빨강) / plain(회색) */
const TYPE_META = {
  create: { label: '등록', icon: 'plus', tone: 'ok' },
  update: { label: '수정', icon: 'edit', tone: 'info' },
  move: { label: '일정 변경', icon: 'calendar', tone: 'info' },
  delete: { label: '삭제', icon: 'trash', tone: 'danger' },
  confirm: { label: '확정', icon: 'check', tone: 'ok' },
  approve: { label: '승인', icon: 'shield', tone: 'ok' },
  cancel: { label: '취소', icon: 'ban', tone: 'warn' },
  reject: { label: '반려', icon: 'x', tone: 'danger' },
  'block-add': { label: '차단 추가', icon: 'ban', tone: 'warn' },
  'block-remove': { label: '차단 삭제', icon: 'trash', tone: 'plain' },
  policy: { label: '정책', icon: 'sliders', tone: 'info' },
  expire: { label: '만료', icon: 'clock', tone: 'warn' },
  rejected: { label: '충돌 거부', icon: 'x-circle', tone: 'danger' },
  undo: { label: '되돌리기', icon: 'undo', tone: 'plain' },
  redo: { label: '다시 실행', icon: 'redo', tone: 'plain' },
};
const ACTOR_ICON = { 관리자: 'shield', 시스템: 'clock', '일반 사용자': 'user' };

const FILTERS = [
  { key: 'all', label: '전체', test: () => true },
  { key: 'changes', label: '변경', test: (e) => !['rejected', 'undo', 'redo', 'expire', 'policy'].includes(e.type) },
  { key: 'rejected', label: '충돌 거부', test: (e) => e.type === 'rejected' },
  { key: 'system', label: '시스템·정책', test: (e) => e.type === 'expire' || e.type === 'policy' },
];

/** "예약 등록: 회의실 A …" 처럼 앞부분(행위 이름)을 굵게 보여 준다. */
function summaryHtml(text) {
  const s = String(text ?? '');
  const i = s.indexOf(': ');
  if (i > 0 && i <= 24) return `<span class="rb-sum__lead">${esc(s.slice(0, i))}</span><span class="rb-sum__rest">${esc(s.slice(i + 2))}</span>`;
  return esc(s);
}

// 시각은 날짜(굵게)와 시각(연하게) 두 줄로 보여 주되, 정렬은 숫자(밀리초)로 한다.
const COLUMNS = [
  { binding: 'atMs', header: '시각', width: 130, align: 'center', html: (r) => `<span class="rb-time"><b>${esc(r.dateText)}</b><span>${esc(r.timeText)}</span></span>` },
  { binding: 'actor', header: '행위자', width: 130, align: 'center', html: (r) => `<span class="rb-actor">${iconSvg(ACTOR_ICON[r.actor] ?? 'user', 14)}${esc(r.actor)}</span>` },
  { binding: 'typeLabel', header: '유형', width: 128, align: 'center', html: (r) => `<span class="rb-evt rb-evt--${esc(r.tone)}">${iconSvg(r.icon, 13)}${esc(r.typeLabel)}</span>` },
  { binding: 'summary', header: '내용', width: '*', minWidth: 300, cssClass: 'rb-cell-wrap', html: (r) => summaryHtml(r.summary), tooltip: (r) => r.summary },
];

const rowTone = (type) => (type === 'rejected' ? 'reject' : type === 'expire' || type === 'policy' ? 'sys' : type === 'undo' || type === 'redo' ? 'mute' : null);

/** 변경 이력(감사 로그): 누가·언제·무엇을 바꿨는지, 충돌로 거부된 시도, 가예약 자동 만료를 FlexGrid 로 보여 준다. (열 머리글 클릭으로 정렬, 열 경계 드래그로 너비 조절) */
export default function HistoryTab({ log, canUndo, canRedo, undoLabel, redoLabel, onUndo, onRedo }) {
  const [filter, setFilter] = useState('all');
  const rows = useMemo(() => {
    const test = FILTERS.find((f) => f.key === filter).test;
    return log.filter(test).map((e) => {
      const meta = TYPE_META[e.type] ?? { label: e.type, icon: 'info', tone: 'plain' };
      return {
        id: e.id,
        atMs: e.at.getTime(),
        dateText: formatDate(e.at),
        timeText: formatTime(e.at),
        actor: e.actor,
        type: e.type,
        typeLabel: meta.label,
        icon: meta.icon,
        tone: meta.tone,
        summary: e.summary,
      };
    });
  }, [log, filter]);

  return (
    <section className="rb-history" aria-label="변경 이력">
      <div className="rb-dash__bar">
        <div role="group" aria-label="이력 필터" className="rb-seg">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className="rb-seg__btn" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
          ))}
        </div>
        <span className="rb-count">{rows.length}건</span>
        <span className="rb-spacer" />
        <button type="button" className="rb-btn" disabled={!canUndo} onClick={onUndo}><Icon name="undo" size={15} /> 되돌리기{undoLabel ? `: ${undoLabel}` : ''}</button>
        <button type="button" className="rb-btn" disabled={!canRedo} onClick={onRedo}><Icon name="redo" size={15} /> 다시 실행{redoLabel ? `: ${redoLabel}` : ''}</button>
      </div>
      {rows.length === 0 ? (
        <div className="rb-empty">
          <span className="rb-empty__icon"><Icon name="history" size={24} /></span>
          <p><strong>표시할 이력이 없습니다.</strong></p>
          <p className="rb-muted">예약을 등록·수정하거나 충돌하는 예약을 시도해 보세요.</p>
        </div>
      ) : (
        <div className="rb-card rb-card--flush">
          <WjGrid data={rows} columns={COLUMNS} rowClass={(r) => rowTone(r.type)} ariaLabel="변경 이력 표" height={560} rowHeight={48} headerHeight={40} />
        </div>
      )}
    </section>
  );
}
