import { formatRange } from '../domain/time.js';
import Icon from './Icon.jsx';

/**
 * "확인 필요" 목록: 새 차단·정책 변경으로 기존 예약에 충돌/간격 경고가 생긴 경우만 나타난다.
 * 저장 시점의 충돌은 폼에서 막히므로, 이 목록은 "이미 저장된 데이터가 규칙과 어긋난 경우"를 알려 준다.
 */
export default function IssuesPanel({ issues, bookings, resourceMap, onPick }) {
  if (issues.size === 0) return null;
  const rows = [...issues.entries()]
    .map(([id, v]) => ({ id, ...v, booking: bookings.find((b) => b.id === id) }))
    .filter((r) => r.booking)
    .sort((a, b) => (a.level === b.level ? a.booking.startAt - b.booking.startAt : a.level === 'conflict' ? -1 : 1));
  const conflicts = rows.filter((r) => r.level === 'conflict').length;
  return (
    <section className="rb-issues" aria-label="충돌·경고 예약" role="status">
      <h2>
        <Icon name="alert" size={18} /> 확인이 필요한 예약 {rows.length}건 <span className="rb-muted">(충돌 {conflicts} · 간격 경고 {rows.length - conflicts})</span>
      </h2>
      <ul>
        {rows.slice(0, 6).map((r) => (
          <li key={r.id}>
            <button type="button" className="rb-link-btn" onClick={() => onPick(r.booking)}>
              <span className={`rb-tag rb-tag--${r.level}`}>{r.level === 'conflict' ? '충돌' : '간격'}</span>{' '}
              {resourceMap.get(r.booking.resourceId)?.name} · {formatRange(r.booking.startAt, r.booking.endAt)} · {r.booking.title}
            </button>
            <span className="rb-muted"> — {r.reasons[0]}</span>
          </li>
        ))}
      </ul>
      {rows.length > 6 && <p className="rb-hint">외 {rows.length - 6}건</p>}
    </section>
  );
}
