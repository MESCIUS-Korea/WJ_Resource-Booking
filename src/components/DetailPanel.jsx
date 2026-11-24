import { BLOCK_KINDS, RESOURCE_TYPES, STATUS } from '../domain/constants.js';
import { colorOf } from '../domain/colors.js';
import { formatDateTime, formatDuration, formatRange } from '../domain/time.js';
import Icon from './Icon.jsx';

const Row = ({ label, children }) => (
  <div className="rb-detail__row">
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

const LockHint = ({ children }) => (
  <p className="rb-lockhint">
    <Icon name="lock" size={14} />
    <span>{children}</span>
  </p>
);

/** 사용자 입력은 모두 React 텍스트 노드로 렌더링한다(HTML 실행 없음). */
export default function DetailPanel({
  selection, resource, issue, relations, role, canConfirm, now, open,
  onEdit, onDelete, onSetStatus, onClose, onRemoveBlock, onOpenBlocks,
}) {
  const booking = selection?.kind === 'booking' ? selection.booking : null;
  const block = selection?.kind === 'block' ? selection.block : null;
  const admin = role === 'admin';
  const color = booking ? colorOf(booking.color) : null;

  return (
    <aside className={`rb-detail ${open ? 'rb-detail--open' : ''}`} aria-label="상세">
      {!selection ? (
        <div className="rb-detail__empty">
          <span className="rb-detail__empty-icon"><Icon name="calendar" size={26} /></span>
          <p><strong>일정을 선택하세요.</strong></p>
          <p className="rb-muted">일정 클릭: 상세 · 더블클릭: 수정<br />끌어서 시간·자원 변경 (충돌이면 자동 거부)</p>
        </div>
      ) : block ? (
        <>
          <div className="rb-detail__head">
            <h2>{BLOCK_KINDS[block.kind] ?? '차단'}: {block.reason}</h2>
            <button type="button" className="rb-icon-btn" onClick={onClose} aria-label="상세 닫기"><Icon name="x" size={18} /></button>
          </div>
          <span className="rb-badge rb-badge--blocked">예약 불가 시간</span>
          <dl className="rb-detail__list">
            <Row label="대상">{block.resourceId ? `${resource?.name ?? block.resourceId}` : '전사(모든 자원)'}</Row>
            <Row label="기간">{formatRange(block.startAt, block.endAt)}</Row>
            <Row label="ID">{block.id}</Row>
          </dl>
          {!admin && <LockHint>차단 삭제는 관리자만 할 수 있습니다.</LockHint>}
          <div className="rb-detail__actions">
            <button type="button" className="rb-btn rb-btn--soft-primary" onClick={onOpenBlocks}><Icon name="ban" size={15} /> 차단 관리 열기</button>
            <button type="button" className="rb-btn rb-btn--soft-danger" disabled={!admin} title={admin ? '' : '관리자만 삭제할 수 있습니다.'} onClick={() => onRemoveBlock(block.id)}>
              <Icon name={admin ? 'trash' : 'lock'} size={15} /> 삭제
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="rb-detail__head">
            <h2>{booking.title}</h2>
            <button type="button" className="rb-icon-btn" onClick={onClose} aria-label="상세 닫기"><Icon name="x" size={18} /></button>
          </div>
          <div className="rb-detail__badges">
            <span className={`rb-badge rb-badge--${booking.status}`}>{STATUS[booking.status]?.label}</span>
            {booking.needsApproval && booking.status === 'tentative' && <span className="rb-tag">승인 대기</span>}
            {issue && <span className={`rb-tag rb-tag--${issue.level}`}>{issue.level === 'conflict' ? '충돌' : '간격 경고'}</span>}
          </div>
          {issue && (
            <ul className="rb-issue-list" aria-label="충돌·경고 사유">
              {issue.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
          <dl className="rb-detail__list">
            <Row label="자원">
              {resource ? `${RESOURCE_TYPES[resource.type].tag} ${resource.name}` : `알 수 없는 자원 (${booking.resourceId})`}
              {resource && !resource.isAvailable && <span className="rb-warn"> · 사용 불가</span>}
              {resource?.requiresApproval && <span className="rb-muted"> · 승인 필요 자원</span>}
            </Row>
            {resource?.location && <Row label="위치">{resource.location}</Row>}
            {resource?.capacity != null && <Row label="수용 인원">{resource.capacity}명{booking.attendees != null ? ` (참석 ${booking.attendees}명)` : ''}</Row>}
            {resource?.equipmentType && <Row label="설비 분류">{resource.equipmentType}</Row>}
            {resource?.department && <Row label="소속/직무">{resource.department} · {resource.role}</Row>}
            <Row label="일시">{formatRange(booking.startAt, booking.endAt)} <span className="rb-muted">({formatDuration((booking.endAt - booking.startAt) / 60000)})</span></Row>
            <Row label="예약자">{booking.bookedBy}</Row>
            {color && (
              <Row label="색상">
                <span className="rb-colordot" style={{ background: color.accent }} aria-hidden="true" />
                {color.label} 범주
              </Row>
            )}
            <Row label="목적/설명">{booking.description}</Row>
            {booking.note && <Row label="비고">{booking.note}</Row>}
            {booking.status === 'tentative' && booking.holdUntil && (
              <Row label="가예약 만료">
                {formatDateTime(booking.holdUntil)}
                <span className={booking.holdUntil - now < 3600 * 1000 ? 'rb-warn' : 'rb-muted'}> · {booking.holdUntil > now ? `${formatDuration(Math.max(1, Math.round((booking.holdUntil - now) / 60000)))} 남음` : '만료됨'}</span>
              </Row>
            )}
            {relations?.series > 1 && <Row label="반복 예약">{booking.seriesIndex}/{relations.series}회차 ({booking.seriesId}) · 이 예약만 수정됩니다</Row>}
            {relations?.group > 1 && <Row label="묶음 예약">{relations.group}건 묶음 ({booking.groupId})</Row>}
            <Row label="ID">{booking.id}</Row>
            <Row label="생성일자">{formatDateTime(booking.createdAt)}</Row>
            <Row label="수정일자">
              {booking.updatedAt?.getTime?.() === booking.createdAt?.getTime?.()
                ? <span className="rb-muted">수정 이력 없음</span>
                : formatDateTime(booking.updatedAt)}
            </Row>
          </dl>
          {booking.status === 'tentative' && booking.needsApproval && !admin && (
            <LockHint>이 자원은 관리자 승인이 필요합니다. 승인 전까지는 가예약 상태로 유지됩니다.</LockHint>
          )}
          <div className="rb-detail__actions">
            {booking.status === 'tentative' && (
              <button
                type="button"
                className="rb-btn rb-btn--primary"
                disabled={!canConfirm}
                title={!canConfirm ? '이 자원은 관리자 승인이 필요합니다.' : ''}
                onClick={() => onSetStatus(booking.id, booking.needsApproval && admin ? 'approve' : 'confirm')}
              >
                <Icon name={canConfirm ? 'check' : 'lock'} size={15} /> {booking.needsApproval && admin ? '승인(확정)' : canConfirm ? '확정' : '관리자 승인 필요'}
              </button>
            )}
            {booking.status === 'tentative' && booking.needsApproval && admin && (
              <button type="button" className="rb-btn rb-btn--danger" onClick={() => onSetStatus(booking.id, 'reject')}><Icon name="x" size={15} /> 반려</button>
            )}
            <button type="button" className="rb-btn rb-btn--soft-primary" onClick={() => onEdit(booking.id)}><Icon name="edit" size={15} /> 수정</button>
            {booking.status !== 'cancelled' && (
              <button type="button" className="rb-btn rb-btn--soft-warn" onClick={() => onSetStatus(booking.id, 'cancel')}><Icon name="ban" size={15} /> 예약 취소</button>
            )}
            <button type="button" className="rb-btn rb-btn--soft-danger" onClick={() => onDelete(booking.id)}><Icon name="trash" size={15} /> 삭제</button>
          </div>
        </>
      )}
    </aside>
  );
}
