import { useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import AdminNotice, { AdminBadge } from './AdminNotice.jsx';
import WjCombo from '../wj/WjCombo.jsx';
import WjDateTimeInput from '../wj/WjDateTimeInput.jsx';
import WjGrid, { esc } from '../wj/WjGrid.jsx';
import { iconSvg } from './icons.js';
import { BLOCK_KINDS, LIMITS, RESOURCE_TYPES } from '../domain/constants.js';
import { formatRange, fromInputValue, toInputValue } from '../domain/time.js';

const KIND_OPTIONS = Object.entries(BLOCK_KINDS).map(([k, v]) => ({ value: k, label: v }));
const MODE_OPTIONS = [
  { value: 'keep', label: '예약은 그대로 두고 "확인 필요"로 표시' },
  { value: 'cancel', label: '예약을 취소하고 차단 적용' },
];

const BLOCK_COLUMNS = [
  { binding: 'kindLabel', header: '유형', width: 84, html: (r) => `<span class="rb-tag rb-tag--${r.kind === 'holiday' ? 'plain' : 'info'}">${esc(r.kindLabel)}</span>` },
  { binding: 'targetName', header: '대상', width: 150 },
  { binding: 'startMs', header: '기간', width: '2*', minWidth: 230, html: (r) => esc(r.periodText), tooltip: (r) => r.periodText },
  { binding: 'reason', header: '사유', width: '*', minWidth: 140, tooltip: (r) => r.reason },
  {
    binding: 'id',
    header: '',
    width: 92,
    sortable: false,
    html: (r, ctx) =>
      `<button type="button" class="rb-btn rb-btn--sm rb-btn--danger-ghost" data-rb-act="remove" data-rb-id="${esc(r.id)}"${ctx.admin ? '' : ' disabled'} title="${ctx.admin ? '' : '관리자만 삭제할 수 있습니다.'}">${iconSvg(ctx.admin ? 'trash' : 'lock', 13)} 삭제</button>`,
  },
];

/**
 * 점검·휴무 차단 관리. 차단 시간에는 새 예약이 거부되고, 스케줄러에는 빗금 일정으로 표시된다.
 * 전사 차단(휴무·전사 점검)은 Wijmo 의 nonworkingTime 으로도 전달되어 비근무 시간 셀로 표시된다. (공식 문서: Configure Working Time)
 * 관리자가 아니면 폼을 숨기지 않고 읽기 전용으로 보여 주며, 제목 배지와 상단 경고로 권한이 필요함을 알린다.
 */
export default function BlockManagerModal({ store, storeState, resources, role, baseDate, focusBlockId, onToast, onClose }) {
  const admin = role === 'admin';
  const [draft, setDraft] = useState(() => ({
    kind: 'maintenance',
    resourceId: '',
    reason: '',
    start: toInputValue(new Date(baseDate.getTime() + 13 * 3600 * 1000)),
    end: toInputValue(new Date(baseDate.getTime() + 15 * 3600 * 1000)),
  }));
  const [mode, setMode] = useState('keep');
  const [submitted, setSubmitted] = useState(false);
  const reasonRef = useRef(null);

  const resName = (id) => (id ? resources.find((r) => r.id === id)?.name ?? id : '전사(모든 자원)');
  const blockInput = useMemo(
    () => ({ kind: draft.kind, resourceId: draft.resourceId, reason: draft.reason, startAt: fromInputValue(draft.start), endAt: fromInputValue(draft.end) }),
    [draft],
  );
  const preview = useMemo(() => store.previewBlock(blockInput), [store, blockInput, storeState]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(
    () =>
      [...storeState.blocks]
        .sort((a, b) => a.startAt - b.startAt)
        .map((b) => ({
          id: b.id,
          kind: b.kind,
          kindLabel: BLOCK_KINDS[b.kind] ?? b.kind,
          targetName: resName(b.resourceId),
          startMs: b.startAt.getTime(),
          periodText: formatRange(b.startAt, b.endAt),
          reason: b.reason,
        })),
    [storeState.blocks], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const gridCtx = useMemo(() => ({ admin }), [admin]);

  const targetOptions = [{ value: '', label: '전사(모든 자원)' }, ...resources.map((r) => ({ value: r.id, label: `${RESOURCE_TYPES[r.type].tag} ${r.name}` }))];

  const add = (e) => {
    e.preventDefault();
    if (!admin) return;
    setSubmitted(true);
    const r = store.addBlock(blockInput, { mode });
    if (!r.ok) {
      if (r.errors?._form) onToast('error', r.errors._form);
      else reasonRef.current?.focus();
      return;
    }
    onToast('success', `${BLOCK_KINDS[blockInput.kind]} 차단을 추가했습니다.${r.affected.length ? ` 이미 잡혀 있던 예약 ${r.affected.length}건을 ${mode === 'cancel' ? '취소했습니다' : '"확인 필요"로 표시했습니다'}.` : ''}`, { label: '되돌리기', onClick: () => store.undo() });
    setDraft((d) => ({ ...d, reason: '' }));
    setSubmitted(false);
  };

  const remove = (id) => {
    const r = store.removeBlock(id);
    if (r.ok) onToast('success', '차단을 삭제했습니다.', { label: '되돌리기', onClick: () => store.undo() });
    else onToast('error', r.errors?._form ?? '삭제하지 못했습니다.');
  };

  const err = (k) => (submitted && preview.errors[k] ? <p className="rb-error">{preview.errors[k]}</p> : null);

  return (
    <Modal
      title={<span className="rb-modal-title">차단 관리 (점검 · 휴무) <AdminBadge admin={admin} /></span>}
      titleId="block-title"
      size="lg"
      onClose={onClose}
      footer={<button type="button" className="rb-btn" onClick={onClose} data-autofocus>닫기</button>}
    >
      <AdminNotice admin={admin}>지금은 조회만 할 수 있습니다. 차단을 추가·삭제하려면 화면 오른쪽 위 역할 전환에서 &apos;관리자&apos;를 선택하세요.</AdminNotice>

      <p className="rb-lead">차단한 시간에는 해당 자원(또는 전사)의 새 예약을 받을 수 없습니다. 점검, 휴무, 장비 교체처럼 사용하지 못하는 시간을 미리 막아 둘 때 씁니다.</p>

      <h3 className="rb-h3">등록된 차단 {rows.length}건</h3>
      {rows.length === 0 ? (
        <p className="rb-muted">등록된 차단이 없습니다.</p>
      ) : (
        <WjGrid
          data={rows}
          columns={BLOCK_COLUMNS}
          ctx={gridCtx}
          rowClass={(r) => (r.id === focusBlockId ? 'focus' : null)}
          onCellAction={(act, id) => act === 'remove' && remove(id)}
          ariaLabel="등록된 차단 목록"
          height={Math.min(260, 38 + rows.length * 40 + 4)}
        />
      )}

      <form onSubmit={add} noValidate className="rb-block-form">
        <h3 className="rb-h3">차단 추가</h3>
        <fieldset className="rb-fieldset" disabled={!admin}>
          <legend className="rb-sr-only">차단 추가 입력</legend>
          <div className="rb-form-grid">
            <div className="rb-field">
              <label htmlFor="b-kind">유형</label>
              <WjCombo id="b-kind" ariaLabel="차단 유형" disabled={!admin} value={draft.kind} options={KIND_OPTIONS} onChange={(v) => setDraft((d) => ({ ...d, kind: v }))} />
            </div>
            <div className="rb-field">
              <label htmlFor="b-target">대상</label>
              <WjCombo id="b-target" ariaLabel="차단 대상" disabled={!admin} value={draft.resourceId} options={targetOptions} onChange={(v) => setDraft((d) => ({ ...d, resourceId: v }))} />
            </div>
            <div className="rb-field">
              <label htmlFor="b-start">시작 (서울 기준)</label>
              <WjDateTimeInput id="b-start" disabled={!admin} value={draft.start} invalid={submitted && !!preview.errors.startAt} onChange={(v) => setDraft((d) => ({ ...d, start: v }))} />
              {err('startAt')}
            </div>
            <div className="rb-field">
              <label htmlFor="b-end">종료 (서울 기준)</label>
              <WjDateTimeInput id="b-end" disabled={!admin} value={draft.end} invalid={submitted && !!preview.errors.endAt} onChange={(v) => setDraft((d) => ({ ...d, end: v }))} />
              {err('endAt')}
            </div>
            <div className="rb-field rb-field--full">
              <label htmlFor="b-reason">사유</label>
              <input ref={reasonRef} id="b-reason" type="text" value={draft.reason} maxLength={LIMITS.reason} placeholder="예) 정기 점검, 프로젝터 교체" onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))} aria-invalid={submitted && preview.errors.reason ? 'true' : undefined} />
              {err('reason')}
            </div>
          </div>
        </fieldset>

        {preview.timeOk && preview.affected.length > 0 && (
          <div className="rb-cp rb-cp--partial" role="status">
            <p className="rb-cp__head"><Icon name="alert" size={18} /> 이 시간에 이미 잡힌 예약이 {preview.affected.length}건 있습니다.</p>
            <ul className="rb-cp__list">
              {preview.affected.slice(0, 6).map((b) => (
                <li key={b.id}>{resName(b.resourceId)} · {formatRange(b.startAt, b.endAt)} · {b.title} ({b.bookedBy})</li>
              ))}
            </ul>
            <div className="rb-field">
              <label htmlFor="b-mode">이미 잡힌 예약은 어떻게 할까요?</label>
              <WjCombo id="b-mode" ariaLabel="이미 잡힌 예약 처리" disabled={!admin} value={mode} options={MODE_OPTIONS} onChange={setMode} />
              <p className="rb-hint">"확인 필요"로 표시하면 예약은 유지되고 상단의 "확인이 필요한 예약" 목록에 나타납니다. 취소를 고르면 해당 예약이 취소됩니다.</p>
            </div>
          </div>
        )}
        {preview.timeOk && preview.affected.length === 0 && <p className="rb-hint">이 시간에 이미 잡힌 예약은 없습니다.</p>}

        <div className="rb-block-form__actions">
          <button type="submit" className="rb-btn rb-btn--primary" disabled={!admin} title={admin ? '' : '관리자만 추가할 수 있습니다.'}>
            <Icon name={admin ? 'plus' : 'lock'} size={15} /> 차단 추가
          </button>
        </div>
      </form>
    </Modal>
  );
}
