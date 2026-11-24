import { formatDate, formatDuration, formatRange } from '../domain/time.js';
import Icon from './Icon.jsx';

const SLOT_KEYS = ['resourceId', 'attendees', 'startAt', 'endAt'];

/** 실패한 항목의 사유 문구(중복 제거). 충돌 문구가 있으면 일반 "시간이 겹칩니다" 문구는 생략한다. */
export function messagesOf(item) {
  const out = [];
  for (const k of SLOT_KEYS) {
    if (k === 'startAt' && item.errors.resourceId) continue;
    if (item.errors[k] && !out.includes(item.errors[k])) out.push(item.errors[k]);
  }
  return out;
}

/**
 * 예약 폼의 실시간 충돌 안내. 저장 로직과 같은 검증(겹침·완충·차단·가용성·수용 인원)을 그대로 보여 주며,
 * 충돌이면 대안 시간·대안 자원·가예약 밀어내기(관리자)를 제안한다.
 */
export default function ConflictPanel({ view, resourceMap, suggestions, displace, onToggleDisplace, onPickSlot, onPickResource, ttlHours }) {
  if (view.total === 0) {
    return (
      <div className="rb-cp rb-cp--idle" role="status">
        <Icon name="info" size={16} /> 자원과 시간을 선택하면 충돌 여부를 바로 확인합니다.
      </div>
    );
  }
  const state = view.failCount === 0 ? 'ok' : view.okCount === 0 ? 'fail' : 'partial';
  const nRes = view.occurrences[0]?.items.length ?? 1;
  const failing = view.occurrences.filter((o) => !o.ok);
  const forced = view.occurrences[0]?.items.filter((i) => i.forcedTentative) ?? [];
  const displaced = [...new Map(view.occurrences.flatMap((o) => o.items.flatMap((i) => i.displaces)).map((b) => [b.id, b])).values()];
  const head = {
    ok: view.total > 1 || nRes > 1 ? `충돌 없음 — ${view.total}회차 × ${nRes}자원 모두 등록할 수 있습니다.` : '충돌 없음 — 저장할 수 있습니다.',
    partial: `일부 회차에 충돌이 있습니다 — 등록 가능 ${view.okCount}회차 / 충돌 ${view.failCount}회차`,
    fail: view.total > 1 ? `모든 회차에 충돌이 있어 저장할 수 없습니다 (${view.failCount}회차).` : '충돌 — 이 시간에는 저장할 수 없습니다.',
  }[state];
  const headIcon = { ok: 'check-circle', partial: 'alert', fail: 'x-circle' }[state];

  return (
    <div className={`rb-cp rb-cp--${state}`} role="status" aria-live="polite">
      <p className="rb-cp__head">
        <Icon name={headIcon} size={18} /> {head}
      </p>

      {failing.length > 0 && (
        <ul className="rb-cp__list">
          {failing.slice(0, 5).map((o) =>
            o.items
              .filter((i) => !i.ok)
              .map((i) => (
                <li key={`${o.index}-${i.resourceId}`}>
                  {view.total > 1 && <strong>{o.index + 1}회차 {formatDate(o.startAt)} · </strong>}
                  {(nRes > 1 || view.total > 1) && <strong>{resourceMap.get(i.resourceId)?.name} — </strong>}
                  {messagesOf(i).join(' ')}
                </li>
              )),
          )}
          {failing.length > 5 && <li className="rb-muted">외 {failing.length - 5}회차</li>}
        </ul>
      )}

      {state !== 'fail' && forced.length > 0 && (
        <p className="rb-cp__note">
          {forced.map((i) => resourceMap.get(i.resourceId)?.name).join(', ')}은(는) 관리자 승인이 필요한 자원입니다. 가예약(승인 대기)으로 등록되며 {ttlHours}시간 안에 승인되지 않으면 자동 해제됩니다.
        </p>
      )}

      {view.displaceNeeded && !displace && (
        <div className="rb-cp__action">
          <span>겹치는 예약이 모두 가예약입니다. 관리자는 가예약을 취소(밀어내기)하고 확정할 수 있습니다.</span>
          <button type="button" className="rb-btn rb-btn--sm" onClick={onToggleDisplace}>가예약 밀어내기 적용</button>
        </div>
      )}
      {displace && displaced.length > 0 && (
        <div className="rb-cp__action rb-cp__action--warn">
          <span>
            저장하면 가예약 {displaced.length}건이 취소됩니다: {displaced.map((b) => `${b.title}(${formatRange(b.startAt, b.endAt)})`).join(', ')} · 되돌리기로 복원할 수 있습니다.
          </span>
          <button type="button" className="rb-btn rb-btn--sm" onClick={onToggleDisplace}>밀어내기 해제</button>
        </div>
      )}

      {suggestions && (suggestions.slots.length > 0 || suggestions.resources.length > 0) && (
        <div className="rb-cp__suggest">
          {suggestions.slots.length > 0 && (
            <div>
              <span className="rb-cp__label">대안 시간</span>
              {suggestions.slots.map((s) => (
                <button key={s.startAt.getTime()} type="button" className="rb-chip-btn" onClick={() => onPickSlot(s)}>
                  {formatRange(s.startAt, s.endAt)} <small>({formatDuration(Math.abs(s.deltaMinutes))} {s.deltaMinutes > 0 ? '뒤' : '앞'})</small>
                </button>
              ))}
            </div>
          )}
          {suggestions.resources.length > 0 && (
            <div>
              <span className="rb-cp__label">같은 시간 가능한 자원</span>
              {suggestions.resources.map((r) => (
                <button key={r.id} type="button" className="rb-chip-btn" onClick={() => onPickResource(r)}>
                  {r.name}{r.capacity != null ? ` (${r.capacity}명)` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {suggestions && suggestions.slots.length === 0 && suggestions.resources.length === 0 && state === 'fail' && (
        <p className="rb-cp__note">조건에 맞는 대안을 찾지 못했습니다. 시간 범위나 자원을 직접 바꿔 보세요.</p>
      )}
    </div>
  );
}
