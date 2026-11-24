import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import ConflictPanel from './ConflictPanel.jsx';
import ColorPicker from './ColorPicker.jsx';
import WjCombo from '../wj/WjCombo.jsx';
import WjAutoComplete from '../wj/WjAutoComplete.jsx';
import WjDateTimeInput from '../wj/WjDateTimeInput.jsx';
import WjMultiSelect from '../wj/WjMultiSelect.jsx';
import WjNumber from '../wj/WjNumber.jsx';
import { LIMITS, REPEAT_FREQ, RESOURCE_TYPES, STATUS } from '../domain/constants.js';
import { draftToInput } from '../domain/plan.js';
import { suggestResources, suggestSlots } from '../domain/suggestions.js';
import { FIELD_ORDER } from '../domain/validation.js';
import { formatDate, formatRange, isValidDate, sameSeoulDay, toInputValue } from '../domain/time.js';

const TYPE_OPTIONS = [{ value: '', label: '유형 선택' }, ...Object.entries(RESOURCE_TYPES).map(([k, v]) => ({ value: k, label: v.label }))];
const STATUS_OPTIONS = Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label }));
const FREQ_UNIT = { daily: '일', weekly: '주', monthly: '개월' };
const SLOT_ERROR_KEYS = ['resourceId', 'startAt', 'endAt', 'attendees'];

/** 미리보기 결과를 폼에서 쓰는 한 가지 모양으로 맞춘다. (등록: 계획 전체 / 수정: 단일 후보 검증) */
function analyze(mode, store, input, { bookingId, displace }) {
  if (mode === 'create') {
    const plan = store.preview(input, { displace });
    return { ...plan, errors: plan.fieldErrors };
  }
  const prep = store.previewUpdate(bookingId, input, { displace });
  if (prep.notFound) return { errors: { _form: '이미 삭제되었거나 존재하지 않는 예약입니다.' }, occurrences: [], total: 0, okCount: 0, failCount: 0, displaceNeeded: false, notFound: true };
  const v = prep.v;
  const slotErrors = {};
  const fieldErrors = {};
  for (const [k, m] of Object.entries(v.errors)) (SLOT_ERROR_KEYS.includes(k) ? slotErrors : fieldErrors)[k] = m;
  const slotOk = Object.keys(slotErrors).length === 0;
  const item = {
    resourceId: prep.rid,
    candidate: prep.cand,
    ok: slotOk,
    errors: slotErrors,
    conflicts: v.conflicts,
    displaceable: v.displaceable && !slotOk,
    displaces: v.displaces,
    forcedTentative: prep.forced,
    needsApproval: false,
  };
  const valid = isValidDate(input.startAt) && isValidDate(input.endAt) && input.startAt < input.endAt && !!prep.rid;
  const occurrences = valid ? [{ index: 0, startAt: input.startAt, endAt: input.endAt, ok: slotOk, items: [item] }] : [];
  return {
    errors: fieldErrors,
    fieldErrors,
    occurrences,
    total: occurrences.length,
    okCount: occurrences.filter((o) => o.ok).length,
    failCount: occurrences.filter((o) => !o.ok).length,
    single: occurrences.length ? item : null,
    displaceNeeded: item.displaceable,
    slotErrors,
  };
}

/**
 * 예약 등록·수정 공통 폼. 원본을 직접 바꾸지 않는 임시 draft 를 쓰고, 저장은 onSubmit(draft, { strategy, displace }) → { ok, ... } 계약을 따른다.
 * 입력 컨트롤: 유형·자원·상태·반복 = ComboBox, 예약자 = AutoComplete, 시작/종료 = InputDateTime, 인원·반복 횟수 = InputNumber, 추가 자원 = MultiSelect,
 *             일정 색상 = ColorPicker(범주 목록).
 * 제목·목적/설명·비고는 일반 텍스트라 기본 입력 요소를 쓴다.
 */
export default function BookingFormModal({ mode, bookingId, initial, resources, bookers = [], store, storeState, role, onSubmit, onClose }) {
  const [draft, setDraft] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState('');
  const [displace, setDisplace] = useState(false);
  const [advOpen, setAdvOpen] = useState(initial.repeat?.freq !== 'none' || (initial.extraResourceIds?.length ?? 0) > 0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [errorTick, setErrorTick] = useState(0);
  const savingRef = useRef(false);
  const fieldRefs = useRef({});
  const summaryRef = useRef(null);
  const viewRef = useRef(null);

  const resourceMap = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const input = useMemo(() => draftToInput(draft), [draft]);
  const rules = storeState.rules;

  // 실시간 충돌 분석 (저장과 같은 검증). 저장소 상태가 바뀌면 다시 계산한다.
  const view = useMemo(
    () => analyze(mode, store, input, { bookingId, displace }),
    [mode, store, input, bookingId, displace, storeState], // eslint-disable-line react-hooks/exhaustive-deps
  );
  viewRef.current = view;

  // 대안 제안: 단일 자원·단일 회차만 대상 (묶음·반복은 사유 목록만 제공).
  //  - 대안 시간: 시간 충돌(겹침·완충·차단)일 때
  //  - 대안 자원: 충돌·사용 불가·수용 인원 초과 등 어떤 사유로든 실패했을 때
  const suggestions = useMemo(() => {
    const single = view.single;
    if (!single || single.ok || view.total !== 1 || input.resourceIds.length !== 1) return null;
    const ctx = store.ctx();
    const ignoreIds = mode === 'edit' ? [bookingId] : [];
    return {
      slots: single.conflicts.length > 0 ? suggestSlots(single.candidate, ctx, { ignoreIds, now: store.now() }) : [],
      resources: suggestResources({ ...single.candidate }, ctx, { ignoreIds }),
    };
  }, [view, store, mode, bookingId, input.resourceIds.length]);

  const flatErrors = useMemo(() => {
    const firstFail = view.occurrences.flatMap((o) => o.items).find((i) => !i.ok);
    return { ...(view.errors ?? {}), ...(firstFail?.errors ?? {}) };
  }, [view]);
  const shown = submitted ? flatErrors : {};
  const hasErrors = Object.keys(flatErrors).length > 0;

  useEffect(() => {
    if (errorTick === 0) return;
    const errs = viewRef.current ? { ...(viewRef.current.errors ?? {}), ...(viewRef.current.occurrences.flatMap((o) => o.items).find((i) => !i.ok)?.errors ?? {}) } : {};
    const key = FIELD_ORDER.find((k) => errs[k]) ?? Object.keys(errs)[0];
    const el = fieldRefs.current[key];
    if (el) el.focus();
    else summaryRef.current?.focus();
  }, [errorTick]);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setRepeat = (patch) => setDraft((d) => ({ ...d, repeat: { ...d.repeat, ...patch } }));
  const onType = (type) => setDraft((d) => ({ ...d, type, resourceId: '', extraResourceIds: d.extraResourceIds }));

  const submit = (e) => {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const v = viewRef.current;
      const strategy = mode === 'create' && v.total > 1 && v.failCount > 0 && v.okCount > 0 ? 'skip' : 'all';
      const res = onSubmit(draft, { strategy, displace });
      if (!res.ok) {
        setFormError(res.errors?._form ?? '');
        setSubmitted(true);
        setErrorTick((t) => t + 1);
      }
    } finally {
      savingRef.current = false;
    }
  };

  const requestClose = () => (dirty ? setConfirmDiscard(true) : onClose());
  const reset = () => {
    setDraft(initial);
    setSubmitted(false);
    setFormError('');
    setDisplace(false);
  };

  const typeResources = resources.filter((r) => r.type === draft.type);
  const resourceOptions = [
    { value: '', label: draft.type ? '자원 선택' : '먼저 유형을 선택하세요' },
    ...typeResources.map((r) => ({ value: r.id, label: `${r.name}${r.isAvailable ? '' : ' (사용 불가)'}${r.requiresApproval ? ' (승인 필요)' : ''}` })),
  ];
  const extraOptions = resources
    .filter((r) => r.id !== draft.resourceId && r.isAvailable)
    .map((r) => ({ value: r.id, label: `${RESOURCE_TYPES[r.type].tag} ${r.name}` }));
  const primary = resourceMap.get(draft.resourceId);
  const needsApprovalHint = role !== 'admin' && draft.status === 'confirmed' && input.resourceIds.some((id) => resourceMap.get(id)?.requiresApproval);

  const start = input.startAt;
  const end = input.endAt;
  const crossing = isValidDate(start) && isValidDate(end) && end > start && !sameSeoulDay(start, new Date(end.getTime() - 1));
  const rangeHint = isValidDate(start) && isValidDate(end) && end > start ? `${formatRange(start, end)}${crossing ? ` · 자정을 넘기며 종료일은 ${formatDate(end)} 입니다.` : ''}` : '';

  const wj = (name) => ({
    id: `f-${name}`,
    invalid: !!shown[name],
    describedBy: shown[name] ? `e-${name}` : undefined,
    inputRef: (el) => {
      fieldRefs.current[name] = el;
    },
  });
  const plainProps = (name) => ({
    ref: (el) => {
      fieldRefs.current[name] = el;
    },
    id: `f-${name}`,
    'aria-invalid': shown[name] ? 'true' : undefined,
    'aria-describedby': shown[name] ? `e-${name}` : undefined,
  });
  const err = (name) => (shown[name] ? <p id={`e-${name}`} className="rb-error">{shown[name]}</p> : null);

  const saveLabel =
    mode === 'create' && view.total > 1 && view.failCount > 0 && view.okCount > 0
      ? `충돌 회차 제외하고 저장 (${view.okCount * (view.occurrences[0]?.items.length ?? 1)}건)`
      : '저장';
  const errorEntries = Object.entries(flatErrors).filter(([k]) => k !== '_form');

  return (
    <>
      <Modal
        title={mode === 'create' ? '예약 등록' : '예약 수정'}
        titleId="booking-form-title"
        size="xl"
        onClose={requestClose}
        footer={
          <>
            <button type="button" className="rb-btn rb-btn--ghost" onClick={reset}>초기화</button>
            <span className="rb-spacer" />
            <button type="button" className="rb-btn" onClick={requestClose}>취소</button>
            <button type="submit" form="booking-form" className="rb-btn rb-btn--primary">{saveLabel}</button>
          </>
        }
      >
        <form id="booking-form" noValidate onSubmit={submit}>
          {(formError || (submitted && hasErrors)) && (
            <div ref={summaryRef} className="rb-error-summary" role="alert" tabIndex={-1}>
              <strong>입력 내용을 확인하세요.</strong>
              <ul>
                {formError && <li>{formError}</li>}
                {errorEntries.map(([k, msg]) => (
                  <li key={k}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="rb-form-grid">
            <div className="rb-field rb-field--full">
              <label htmlFor="f-title">제목 <span className="rb-req" aria-hidden="true">*</span></label>
              <input {...plainProps('title')} type="text" required aria-required="true" value={draft.title} onChange={(e) => set({ title: e.target.value })} data-autofocus />
              <p className="rb-hint">{draft.title.trim().length}/{LIMITS.title}</p>
              {err('title')}
            </div>
            <div className="rb-field">
              <label htmlFor="f-type">자원 유형 <span className="rb-req" aria-hidden="true">*</span></label>
              <WjCombo {...wj('type')} value={draft.type} options={TYPE_OPTIONS} onChange={onType} />
              {err('type')}
            </div>
            <div className="rb-field">
              <label htmlFor="f-resourceId">예약 자원 <span className="rb-req" aria-hidden="true">*</span></label>
              <WjCombo {...wj('resourceId')} value={draft.resourceId} options={resourceOptions} disabled={!draft.type} onChange={(v) => set({ resourceId: v })} />
              {err('resourceId')}
            </div>
            <div className="rb-field">
              <label htmlFor="f-startAt">시작 (서울 기준) <span className="rb-req" aria-hidden="true">*</span></label>
              <WjDateTimeInput {...wj('startAt')} value={draft.start} onChange={(v) => set({ start: v })} />
              {err('startAt')}
            </div>
            <div className="rb-field">
              <label htmlFor="f-endAt">종료 (서울 기준) <span className="rb-req" aria-hidden="true">*</span></label>
              <WjDateTimeInput {...wj('endAt')} value={draft.end} onChange={(v) => set({ end: v })} />
              {err('endAt')}
            </div>
            {rangeHint && <p className="rb-hint rb-field--full">{rangeHint} (시간 목록은 30분 단위, 직접 입력은 분 단위 가능)</p>}
            <div className="rb-field--full">
              <ConflictPanel
                view={view}
                resourceMap={resourceMap}
                suggestions={suggestions}
                displace={displace}
                ttlHours={rules.tentativeTtlHours}
                onToggleDisplace={() => setDisplace((v) => !v)}
                onPickSlot={(s) => set({ start: toInputValue(s.startAt), end: toInputValue(s.endAt) })}
                onPickResource={(r) => set({ resourceId: r.id, type: r.type })}
              />
            </div>
            {primary?.capacity != null && (
              <div className="rb-field">
                <label htmlFor="f-attendees">참석 인원 (선택)</label>
                <WjNumber {...wj('attendees')} value={draft.attendees} min={1} placeholder={`수용 ${primary.capacity}명`} onChange={(v) => set({ attendees: v })} />
                <p className="rb-hint">{primary.name} 수용 인원 {primary.capacity}명</p>
                {err('attendees')}
              </div>
            )}
            <div className="rb-field">
              <label htmlFor="f-bookedBy">예약자 <span className="rb-req" aria-hidden="true">*</span></label>
              <WjAutoComplete {...wj('bookedBy')} items={bookers} value={draft.bookedBy} onChange={(v) => set({ bookedBy: v })} />
              <p className="rb-hint">가상 예약자 표시명 (실제 인증 계정 아님). 목록에 없는 이름도 입력할 수 있습니다.</p>
              {err('bookedBy')}
            </div>
            <div className="rb-field">
              <label htmlFor="f-status">상태</label>
              <WjCombo {...wj('status')} value={draft.status} options={STATUS_OPTIONS} onChange={(v) => set({ status: v })} />
              {needsApprovalHint && <p className="rb-hint rb-hint--warn">승인이 필요한 자원이 포함되어 있어 가예약(승인 대기)으로 저장됩니다.</p>}
              {draft.status === 'tentative' && <p className="rb-hint">가예약은 {rules.tentativeTtlHours}시간 안에 확정하지 않으면 자동 해제됩니다.</p>}
              {err('status')}
            </div>
            <div className="rb-field">
              <label htmlFor="f-color">일정 색상</label>
              <ColorPicker id="f-color" value={draft.color ?? ''} onChange={(v) => set({ color: v })} />
              <p className="rb-hint">일정 카드에 표시되는 색입니다. 기본은 자원 유형 색입니다.</p>
            </div>
            <div className="rb-field rb-field--full">
              <label htmlFor="f-description">목적/설명 <span className="rb-req" aria-hidden="true">*</span></label>
              <textarea {...plainProps('description')} rows={3} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
              <p className="rb-hint">{draft.description.trim().length}/{LIMITS.description}</p>
              {err('description')}
            </div>
            <div className="rb-field rb-field--full">
              <label htmlFor="f-note">비고 (선택)</label>
              <textarea {...plainProps('note')} rows={2} value={draft.note} onChange={(e) => set({ note: e.target.value })} />
              {err('note')}
            </div>
            {mode === 'create' && (
              <div className="rb-field--full">
                <button type="button" className="rb-link-btn" aria-expanded={advOpen} aria-controls="adv-options" onClick={() => setAdvOpen((v) => !v)}>
                  {advOpen ? '▾' : '▸'} 반복 · 묶음(여러 자원) 예약
                </button>
                {advOpen && (
                  <div id="adv-options" className="rb-adv">
                    <div className="rb-adv__row">
                      <div className="rb-field">
                        <label htmlFor="f-freq">반복</label>
                        <WjCombo id="f-freq" ariaLabel="반복" value={draft.repeat.freq} options={REPEAT_FREQ} onChange={(v) => setRepeat({ freq: v })} />
                      </div>
                      {draft.repeat.freq !== 'none' && (
                        <>
                          <div className="rb-field">
                            <label htmlFor="f-interval">간격 ({FREQ_UNIT[draft.repeat.freq]})</label>
                            <WjNumber id="f-interval" ariaLabel="반복 간격" value={draft.repeat.interval} min={1} max={12} isRequired onChange={(v) => setRepeat({ interval: v ?? 1 })} />
                          </div>
                          <div className="rb-field">
                            <label htmlFor="f-repeat">횟수 (2~{rules.maxOccurrences})</label>
                            <WjNumber {...wj('repeat')} id="f-repeat" ariaLabel="반복 횟수" value={draft.repeat.count} min={2} max={rules.maxOccurrences} isRequired onChange={(v) => setRepeat({ count: v ?? 2 })} />
                          </div>
                          {draft.repeat.freq === 'daily' && (
                            <label className="rb-check rb-adv__check">
                              <input type="checkbox" checked={!!draft.repeat.weekdaysOnly} onChange={(e) => setRepeat({ weekdaysOnly: e.target.checked })} />
                              주말 제외(평일만)
                            </label>
                          )}
                        </>
                      )}
                    </div>
                    {err('repeat')}
                    {draft.repeat.freq !== 'none' && view.occurrences.length > 0 && (
                      <p className="rb-hint">
                        {view.occurrences.slice(0, 6).map((o) => `${o.index + 1}회 ${formatDate(o.startAt)}`).join(' · ')}
                        {view.occurrences.length > 6 ? ` … 외 ${view.occurrences.length - 6}회` : ''}
                      </p>
                    )}
                    <div className="rb-field">
                      <label htmlFor="f-extra">함께 예약할 자원 (묶음)</label>
                      <WjMultiSelect ariaLabel="함께 예약할 자원" width="100%" placeholder="없음" headerFormat="{count:n0}개 자원 추가" options={extraOptions} values={draft.extraResourceIds} onChange={(v) => set({ extraResourceIds: v })} />
                      <p className="rb-hint">선택한 자원을 같은 시간에 함께 예약합니다. 한 회차에서 하나라도 충돌하면 그 회차 전체가 실패합니다. (예: 설비 + 작업자)</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            {mode === 'edit' && (
              <p className="rb-hint rb-field--full">반복·묶음 예약의 일부라도 이 화면에서는 이 예약 1건만 수정됩니다.</p>
            )}
          </div>
        </form>
      </Modal>
      {confirmDiscard && (
        <ConfirmDialog title="변경 내용을 폐기할까요?" confirmLabel="폐기" danger cancelLabel="계속 편집" onConfirm={onClose} onCancel={() => setConfirmDiscard(false)}>
          <p>저장하지 않은 변경 내용이 있습니다. 닫으면 변경 내용이 사라지고 원본 예약은 바뀌지 않습니다.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
