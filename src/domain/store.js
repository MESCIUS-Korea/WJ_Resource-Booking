import { BLOCK_KINDS, DEFAULT_RULES, LIMITS, ROLES, occupies } from './constants.js';
import { buildCtx, overlaps } from './conflicts.js';
import { planBookings } from './plan.js';
import { validateCandidate } from './validation.js';
import { addMinutes, formatRange, isValidDate } from './time.js';

const MAX_HISTORY = 50;
const MAX_LOG = 300;

const clip = (s, n) => String(s).slice(0, n);
const appendNote = (note, extra) => clip([String(note ?? '').trim(), extra].filter(Boolean).join(' '), LIMITS.note);
const numberOr = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);

/**
 * 예약·차단 상태 저장소 (React 와 무관한 순수 로직 + 구독).
 * 모든 변경은 "명령 → 검증 → 1회 커밋" 이며, 검증을 통과하기 전에는 상태를 바꾸지 않는다.
 * 커밋마다 되돌리기용 스냅샷과 변경 이력(감사 로그)을 남긴다.
 *
 * 명령은 예외를 던지지 않고 { ok, ... } 를 반환한다. (실패 시 errors / plan / conflicts 등을 함께 반환)
 */
export function createStore({ resources, seed, clock = {}, role = 'user', rules = DEFAULT_RULES }) {
  const listeners = new Set();
  const seq = { booking: 1, block: 1, group: 1, series: 1, log: 1 };
  let state;

  const emit = () => listeners.forEach((fn) => fn());
  const now = () => new Date((clock.fixed ? clock.fixed.getTime() : Date.now()) + state.offsetMs);
  const ctx = (over = {}) => buildCtx({ resources, bookings: state.bookings, blocks: state.blocks, rules: state.rules, ...over });
  const resName = (id) => resources.find((r) => r.id === id)?.name ?? id ?? '전사';
  const actor = () => ROLES[state.role] ?? state.role;
  const pad = (n) => String(n).padStart(3, '0');
  const bookingSummary = (b) => `${resName(b.resourceId)} ${formatRange(b.startAt, b.endAt)} "${b.title}"`;

  function initSeq(bookings, blocks) {
    const maxOf = (arr, re) => arr.reduce((m, x) => Math.max(m, Number(re.exec(x.id)?.[1] ?? 0)), 0);
    seq.booking = maxOf(bookings, /^BK-(\d+)$/) + 1;
    seq.block = maxOf(blocks, /^BL-(\d+)$/) + 1;
    seq.group = 1;
    seq.series = 1;
    seq.log = 1;
  }

  function now0() {
    return new Date(clock.fixed ? clock.fixed.getTime() : Date.now());
  }

  function initialState() {
    const data = seed(now0());
    initSeq(data.bookings, data.blocks);
    return {
      bookings: data.bookings,
      blocks: data.blocks,
      rules: { ...rules, bufferMinutes: { ...rules.bufferMinutes } },
      role,
      offsetMs: 0,
      past: [],
      future: [],
      log: [],
    };
  }

  state = initialState();

  function makeLog({ type, summary, ids = [], actorName, meta = null, undoable = false }) {
    return { id: `LG-${pad(seq.log++)}`, at: now(), actor: actorName ?? actor(), type, summary, ids, meta, undoable };
  }

  function pushLog(entry) {
    state = { ...state, log: [entry, ...state.log].slice(0, MAX_LOG) };
    emit();
  }

  function commit({ label, type, summary, ids = [], bookings, blocks, actorName, meta }) {
    const entry = makeLog({ type, summary, ids, actorName, meta, undoable: true });
    state = {
      ...state,
      past: [...state.past, { label, snapshot: { bookings: state.bookings, blocks: state.blocks } }].slice(-MAX_HISTORY),
      future: [],
      bookings: bookings ?? state.bookings,
      blocks: blocks ?? state.blocks,
      log: [entry, ...state.log].slice(0, MAX_LOG),
    };
    emit();
    return entry;
  }

  function reject(summary, conflicts, ids = []) {
    const kinds = [...new Set((conflicts ?? []).map((c) => c.kind))];
    pushLog(makeLog({ type: 'rejected', summary, ids, meta: { kinds } }));
  }

  const adminOnly = () => (state.role === 'admin' ? null : { ok: false, errors: { _form: '관리자 권한이 필요합니다.' } });

  // ---------------------------------------------------------------- 예약 등록 (반복 × 묶음)
  function preview(input, opts = {}) {
    return planBookings(input, ctx(), { role: state.role, displace: !!opts.displace });
  }

  function create(input, { strategy = 'all', displace = false } = {}) {
    const plan = preview(input, { displace });
    if (Object.keys(plan.fieldErrors).length > 0 || plan.total === 0) return { ok: false, plan };
    const goods = plan.occurrences.filter((o) => o.ok);
    const conflictsOf = (occs) => occs.flatMap((o) => o.items.flatMap((i) => i.conflicts));
    if (goods.length === 0 || (strategy === 'all' && plan.failCount > 0)) {
      const bad = plan.occurrences.filter((o) => !o.ok);
      reject(`예약 거부(충돌): ${input.title || '(제목 없음)'} · ${input.resourceIds.map(resName).join(', ')} ${formatRange(input.startAt, input.endAt)}`, conflictsOf(bad), []);
      return { ok: false, plan };
    }
    const t = now();
    const groupId = input.resourceIds.length > 1 ? `GR-${pad(seq.group++)}` : null;
    const seriesId = plan.total > 1 ? `SR-${pad(seq.series++)}` : null;
    const created = [];
    const gone = new Set();
    for (const o of goods) {
      for (const item of o.items) {
        item.displaces.forEach((b) => gone.add(b.id));
        const res = resources.find((r) => r.id === item.resourceId);
        const status = item.candidate.status;
        created.push({
          id: `BK-${pad(seq.booking++)}`,
          resourceId: item.resourceId,
          title: input.title,
          startAt: o.startAt,
          endAt: o.endAt,
          bookedBy: input.bookedBy,
          description: input.description,
          status,
          note: input.note,
          attendees: res?.capacity != null ? input.attendees : null,
          color: input.color ?? '', // 일정 색상 키 ('' = 기본: 자원 유형 색)
          holdUntil: status === 'tentative' ? addMinutes(t, state.rules.tentativeTtlHours * 60) : null,
          needsApproval: status === 'tentative' && !!res?.requiresApproval,
          groupId,
          seriesId,
          seriesIndex: seriesId ? o.index + 1 : null,
          createdAt: t,
          updatedAt: t,
        });
      }
    }
    const displaced = state.bookings.filter((b) => gone.has(b.id));
    const kept = state.bookings.map((b) =>
      gone.has(b.id) ? { ...b, status: 'cancelled', holdUntil: null, needsApproval: false, note: appendNote(b.note, `[확정 예약에 밀려 취소됨]`), updatedAt: t } : b,
    );
    const first = created[0];
    const extra = [
      created.length > 1 ? `외 ${created.length - 1}건` : '',
      plan.failCount > 0 ? `(충돌 ${plan.failCount}회차 제외)` : '',
      displaced.length ? `(가예약 ${displaced.length}건 밀어냄)` : '',
    ].filter(Boolean).join(' ');
    commit({
      label: '예약 등록',
      type: 'create',
      summary: `예약 등록: ${bookingSummary(first)} ${extra}`.trim(),
      ids: created.map((b) => b.id),
      bookings: [...kept, ...created],
      meta: { displaced: displaced.map((b) => b.id) },
    });
    return {
      ok: true,
      created,
      displaced,
      skipped: plan.occurrences.filter((o) => !o.ok).map((o) => o.index),
      plan,
    };
  }

  // ---------------------------------------------------------------- 수정·이동·상태 변경 공통
  /** 수정 후보를 만들고 검증한다. (커밋하지 않음) 승인 정책이 필요하면 상태를 가예약으로 바꾼다. */
  function prepareUpdate(id, input, { displace = false, authorized = false } = {}) {
    const existing = state.bookings.find((b) => b.id === id);
    if (!existing) return { notFound: true };
    const rid = input.resourceIds?.[0] ?? existing.resourceId;
    const res = resources.find((r) => r.id === rid);
    let status = input.status;
    let forced = false;
    if (!authorized && state.role !== 'admin' && res?.requiresApproval && status === 'confirmed') {
      const slotChanged =
        existing.resourceId !== rid ||
        existing.startAt.getTime() !== input.startAt?.getTime?.() ||
        existing.endAt.getTime() !== input.endAt?.getTime?.();
      if (!(existing.status === 'confirmed' && !slotChanged)) {
        status = 'tentative';
        forced = true;
      }
    }
    const cand = {
      title: input.title,
      type: res?.type ?? input.type,
      resourceId: rid,
      startAt: input.startAt,
      endAt: input.endAt,
      bookedBy: input.bookedBy,
      description: input.description,
      status,
      note: input.note,
      attendees: input.attendees,
    };
    const v = validateCandidate(cand, ctx(), { selfId: id, role: state.role, displace });
    return { existing, res, rid, cand, status, forced, v };
  }

  /** 수정 폼의 실시간 충돌 안내용 (저장하지 않음) */
  function previewUpdate(id, input, opts = {}) {
    return prepareUpdate(id, input, opts);
  }

  function applyUpdate(id, input, { displace = false, label = '예약 수정', type = 'update', authorized = false } = {}) {
    const prep = prepareUpdate(id, input, { displace, authorized });
    if (prep.notFound) return { ok: false, notFound: true, errors: { _form: '이미 삭제되었거나 존재하지 않는 예약입니다.' } };
    const { existing, res, rid, cand, status, v } = prep;
    if (!v.ok) {
      if (v.conflicts.length) reject(`${label} 거부(충돌): ${bookingSummary({ ...existing, ...cand })}`, v.conflicts, [id]);
      return { ok: false, errors: v.errors, conflicts: v.conflicts, displaceable: v.displaceable, firstField: v.firstField };
    }
    const t = now();
    const gone = new Set(v.displaces.map((b) => b.id));
    const updated = {
      ...existing,
      resourceId: rid,
      title: cand.title,
      startAt: cand.startAt,
      endAt: cand.endAt,
      bookedBy: cand.bookedBy,
      description: cand.description,
      status,
      note: cand.note,
      attendees: res?.capacity != null ? cand.attendees : null,
      color: input.color ?? existing.color ?? '', // 폼에서 '기본'을 고르면 '' 로 지워지고, 이동·상태 변경은 기존 색을 유지한다
      holdUntil: status === 'tentative' ? (existing.status === 'tentative' && existing.holdUntil ? existing.holdUntil : addMinutes(t, state.rules.tentativeTtlHours * 60)) : null,
      needsApproval: status === 'tentative' && !!res?.requiresApproval,
      updatedAt: t,
    };
    const next = state.bookings.map((b) => {
      if (b.id === id) return updated;
      if (gone.has(b.id)) return { ...b, status: 'cancelled', holdUntil: null, needsApproval: false, note: appendNote(b.note, '[확정 예약에 밀려 취소됨]'), updatedAt: t };
      return b;
    });
    commit({
      label,
      type,
      summary: `${label}: ${bookingSummary(updated)}${gone.size ? ` (가예약 ${gone.size}건 밀어냄)` : ''}`,
      ids: [id, ...gone],
      bookings: next,
      meta: { displaced: [...gone] },
    });
    return { ok: true, booking: updated, displaced: state.bookings.filter((b) => gone.has(b.id)) };
  }

  const inputFromBooking = (b, over = {}) => ({
    title: b.title,
    type: resources.find((r) => r.id === b.resourceId)?.type ?? '',
    resourceIds: [b.resourceId],
    startAt: b.startAt,
    endAt: b.endAt,
    bookedBy: b.bookedBy,
    description: b.description,
    status: b.status,
    note: b.note ?? '',
    attendees: b.attendees ?? null,
    color: b.color ?? '',
    ...over,
  });

  const update = (id, input, opts) => applyUpdate(id, input, { ...opts, label: '예약 수정', type: 'update' });

  /** 드래그로 옮기거나 가장자리를 늘린 일정 변경. values: { startAt, endAt, resourceId } (moves.resolveMove 의 결과) */
  function move(id, values) {
    const existing = state.bookings.find((b) => b.id === id);
    if (!existing) return { ok: false, notFound: true, errors: { _form: '이미 삭제되었거나 존재하지 않는 예약입니다.' } };
    const target = resources.find((r) => r.id === (values.resourceId ?? existing.resourceId));
    const from = resources.find((r) => r.id === existing.resourceId);
    if (target && from && target.type !== from.type) {
      return { ok: false, errors: { _form: `${from.name}의 예약은 다른 유형(${target.name})의 자원으로 옮길 수 없습니다.` } };
    }
    const input = inputFromBooking(existing, { resourceIds: [target?.id ?? existing.resourceId], startAt: values.startAt, endAt: values.endAt });
    const unchanged =
      input.resourceIds[0] === existing.resourceId && input.startAt.getTime() === existing.startAt.getTime() && input.endAt.getTime() === existing.endAt.getTime();
    if (unchanged) return { ok: true, unchanged: true, booking: existing };
    return applyUpdate(id, input, { label: '일정 변경', type: 'move' });
  }

  /** 가예약 확정 가능 여부: 관리자는 항상, 일반 사용자는 승인이 필요 없는 자원만 */
  const canConfirm = (booking) => {
    const res = resources.find((r) => r.id === booking.resourceId);
    return state.role === 'admin' || !res?.requiresApproval;
  };

  /** kind: 'confirm'(확정) | 'approve'(승인) | 'cancel'(취소) | 'reject'(반려) */
  function setStatus(id, kind, { reason = '' } = {}) {
    const existing = state.bookings.find((b) => b.id === id);
    if (!existing) return { ok: false, notFound: true, errors: { _form: '이미 삭제되었거나 존재하지 않는 예약입니다.' } };
    const confirming = kind === 'confirm' || kind === 'approve';
    if (confirming && existing.status !== 'tentative') return { ok: false, errors: { _form: '가예약만 확정할 수 있습니다.' } };
    if (confirming && !canConfirm(existing)) return { ok: false, errors: { _form: '이 자원의 가예약 확정은 관리자 승인이 필요합니다.' } };
    if (kind === 'reject' && state.role !== 'admin') return { ok: false, errors: { _form: '반려는 관리자만 할 수 있습니다.' } };
    const label = { confirm: '예약 확정', approve: '승인(확정)', cancel: '예약 취소', reject: '반려(취소)' }[kind];
    const input = inputFromBooking(existing, {
      status: confirming ? 'confirmed' : 'cancelled',
      note: confirming ? existing.note : appendNote(existing.note, `[${kind === 'reject' ? '반려' : '취소'}${reason ? `: ${reason}` : ''}]`),
    });
    return applyUpdate(id, input, { label, type: kind, authorized: true });
  }

  function remove(id) {
    const existing = state.bookings.find((b) => b.id === id);
    if (!existing) return { ok: false, notFound: true, errors: { _form: '이미 삭제되었거나 존재하지 않는 예약입니다.' } };
    commit({ label: '예약 삭제', type: 'delete', summary: `예약 삭제: ${bookingSummary(existing)}`, ids: [id], bookings: state.bookings.filter((b) => b.id !== id) });
    return { ok: true };
  }

  // ---------------------------------------------------------------- 차단(점검·휴무)
  function normalizeBlock(input) {
    const rid = input.resourceId === '' || input.resourceId == null ? null : input.resourceId;
    const errors = {};
    if (!BLOCK_KINDS[input.kind]) errors.kind = '차단 유형을 선택하세요.';
    const reason = String(input.reason ?? '').trim();
    if (!reason) errors.reason = '사유를 입력하세요.';
    else if (reason.length > LIMITS.reason) errors.reason = `사유는 ${LIMITS.reason}자 이내로 입력하세요.`;
    if (!isValidDate(input.startAt)) errors.startAt = '시작 일시를 올바르게 입력하세요.';
    if (!isValidDate(input.endAt)) errors.endAt = '종료 일시를 올바르게 입력하세요.';
    if (!errors.startAt && !errors.endAt && input.startAt >= input.endAt) errors.endAt = '종료 일시는 시작 일시보다 늦어야 합니다.';
    if (rid && !resources.some((r) => r.id === rid)) errors.resourceId = '존재하지 않는 자원입니다.';
    return { errors, block: { resourceId: rid, kind: input.kind, reason, startAt: input.startAt, endAt: input.endAt } };
  }

  const affectedBy = (b) =>
    state.bookings.filter((x) => occupies(x.status) && (b.resourceId == null || x.resourceId === b.resourceId) && overlaps(x.startAt, x.endAt, b.startAt, b.endAt));

  /** 차단 추가 미리보기. 사유가 비어 있어도 시간·대상이 유효하면 영향을 받는 예약을 미리 보여 준다. */
  function previewBlock(input) {
    const { errors, block } = normalizeBlock(input);
    const timeOk = !errors.startAt && !errors.endAt && !errors.resourceId;
    return { ok: Object.keys(errors).length === 0, timeOk, errors, affected: timeOk ? affectedBy(block) : [] };
  }

  /** mode: 'keep'(영향 예약은 확인 필요로 표시) | 'cancel'(영향 예약 취소 후 차단) */
  function addBlock(input, { mode = 'keep' } = {}) {
    const denied = adminOnly();
    if (denied) return denied;
    const { errors, block } = normalizeBlock(input);
    if (Object.keys(errors).length) return { ok: false, errors };
    const t = now();
    const affected = affectedBy(block);
    const created = { id: `BL-${pad(seq.block++)}`, ...block, createdAt: t };
    const ids = new Set(affected.map((b) => b.id));
    const bookings =
      mode === 'cancel'
        ? state.bookings.map((b) => (ids.has(b.id) ? { ...b, status: 'cancelled', holdUntil: null, needsApproval: false, note: appendNote(b.note, `[차단으로 취소: ${block.reason}]`), updatedAt: t } : b))
        : state.bookings;
    commit({
      label: '차단 추가',
      type: 'block-add',
      summary: `${BLOCK_KINDS[block.kind]} 차단 추가: ${block.resourceId ? resName(block.resourceId) : '전사'} ${formatRange(block.startAt, block.endAt)} (${block.reason})${affected.length ? ` · 영향 예약 ${affected.length}건 ${mode === 'cancel' ? '취소' : '확인 필요'}` : ''}`,
      ids: [created.id, ...ids],
      bookings,
      blocks: [...state.blocks, created],
    });
    return { ok: true, block: created, affected };
  }

  function removeBlock(id) {
    const denied = adminOnly();
    if (denied) return denied;
    const b = state.blocks.find((x) => x.id === id);
    if (!b) return { ok: false, notFound: true, errors: { _form: '이미 삭제되었거나 존재하지 않는 차단입니다.' } };
    commit({ label: '차단 삭제', type: 'block-remove', summary: `차단 삭제: ${b.resourceId ? resName(b.resourceId) : '전사'} ${formatRange(b.startAt, b.endAt)} (${b.reason})`, ids: [id], blocks: state.blocks.filter((x) => x.id !== id) });
    return { ok: true };
  }

  // ---------------------------------------------------------------- 정책·역할·시계
  function setRules(patch) {
    const denied = adminOnly();
    if (denied) return denied;
    const cur = state.rules;
    const next = {
      ...cur,
      ...patch,
      bufferMinutes: { ...cur.bufferMinutes, ...(patch.bufferMinutes ?? {}) },
    };
    for (const k of Object.keys(next.bufferMinutes)) next.bufferMinutes[k] = Math.min(240, Math.max(0, Math.trunc(numberOr(next.bufferMinutes[k], 0))));
    next.tentativeTtlHours = Math.min(720, Math.max(1, numberOr(next.tentativeTtlHours, cur.tentativeTtlHours)));
    next.allowDisplace = !!next.allowDisplace;
    state = { ...state, rules: next };
    pushLog(makeLog({ type: 'policy', summary: `정책 변경: 완충 시간 설비 ${next.bufferMinutes.equipment}분 / 회의실 ${next.bufferMinutes.room}분 / 작업자 ${next.bufferMinutes.worker}분 · 가예약 유지 ${next.tentativeTtlHours}시간 · 밀어내기 ${next.allowDisplace ? '허용' : '금지'}` }));
    return { ok: true, rules: next };
  }

  function setRole(next) {
    if (!ROLES[next] || next === state.role) return;
    state = { ...state, role: next };
    emit();
  }

  /** 가예약 유지 시간이 지난 예약을 자동으로 취소한다. (30초마다 호출) */
  function expireHolds({ silent = false } = {}) {
    const t = now();
    const expired = state.bookings.filter((b) => b.status === 'tentative' && b.holdUntil && b.holdUntil <= t);
    if (!expired.length) return [];
    const ids = new Set(expired.map((b) => b.id));
    state = {
      ...state,
      bookings: state.bookings.map((b) => (ids.has(b.id) ? { ...b, status: 'cancelled', holdUntil: null, needsApproval: false, note: appendNote(b.note, '[가예약 만료로 자동 해제]'), updatedAt: t } : b)),
    };
    if (silent) emit();
    else pushLog(makeLog({ type: 'expire', actorName: '시스템', summary: `가예약 만료 해제 ${expired.length}건: ${expired.map((b) => `${resName(b.resourceId)} "${b.title}"`).join(', ')}`, ids: [...ids] }));
    return expired;
  }

  /** 시연용 시계: 현재 시각을 앞당겨 가예약 만료 등을 확인한다. */
  function advanceClock(minutes) {
    state = { ...state, offsetMs: state.offsetMs + minutes * 60 * 1000 };
    emit();
    return expireHolds();
  }

  function resetClock() {
    state = { ...state, offsetMs: 0 };
    emit();
  }

  // ---------------------------------------------------------------- 되돌리기·다시 실행·초기화
  function undo() {
    const top = state.past[state.past.length - 1];
    if (!top) return { ok: false };
    state = {
      ...state,
      past: state.past.slice(0, -1),
      future: [...state.future, { label: top.label, snapshot: { bookings: state.bookings, blocks: state.blocks } }],
      bookings: top.snapshot.bookings,
      blocks: top.snapshot.blocks,
    };
    expireHolds({ silent: true });
    pushLog(makeLog({ type: 'undo', summary: `되돌리기: ${top.label}` }));
    return { ok: true, label: top.label };
  }

  function redo() {
    const top = state.future[state.future.length - 1];
    if (!top) return { ok: false };
    state = {
      ...state,
      future: state.future.slice(0, -1),
      past: [...state.past, { label: top.label, snapshot: { bookings: state.bookings, blocks: state.blocks } }],
      bookings: top.snapshot.bookings,
      blocks: top.snapshot.blocks,
    };
    expireHolds({ silent: true });
    pushLog(makeLog({ type: 'redo', summary: `다시 실행: ${top.label}` }));
    return { ok: true, label: top.label };
  }

  function reset() {
    const keepRole = state.role;
    state = initialState();
    state = { ...state, role: keepRole };
    emit();
  }

  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getState: () => state,
    now,
    ctx,
    preview,
    previewBlock,
    previewUpdate,
    create,
    update,
    move,
    setStatus,
    remove,
    canConfirm,
    addBlock,
    removeBlock,
    setRules,
    setRole,
    expireHolds,
    advanceClock,
    resetClock,
    undo,
    redo,
    reset,
  };
}
