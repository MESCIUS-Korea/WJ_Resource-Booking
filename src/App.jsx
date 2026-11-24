import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import SchedulerAdapter from './scheduler/SchedulerAdapter.jsx';
import FilterBar from './components/FilterBar.jsx';
import KpiCards from './components/KpiCards.jsx';
import DetailPanel from './components/DetailPanel.jsx';
import IssuesPanel from './components/IssuesPanel.jsx';
import BookingFormModal from './components/BookingFormModal.jsx';
import BlockManagerModal from './components/BlockManagerModal.jsx';
import PolicyModal from './components/PolicyModal.jsx';
import DashboardTab from './components/DashboardTab.jsx';
import HistoryTab from './components/HistoryTab.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import Toasts from './components/Toasts.jsx';
import Icon from './components/Icon.jsx';
import WjTabPanel from './wj/WjTabPanel.jsx';
import { DEFAULT_LAYOUT, HOUR_OPTIONS, ROLES } from './domain/constants.js';
import { RESOURCES, buildSeed } from './domain/seedData.js';
import { findExistingIssues } from './domain/conflicts.js';
import { bookingToDraft, defaultDraft } from './domain/drafts.js';
import { bookingsToCsv, bookingsToIcs } from './domain/exporters.js';
import {
  DEFAULT_FILTERS,
  applyFilters,
  clampDateRange,
  computeKpis,
  filterLanes,
  getViewRange,
  isDefaultFilters,
  sameFilters,
  toNonworkingTime,
  toSchedulerItems,
} from './domain/filters.js';
import { resolveMove } from './domain/moves.js';
import { draftToInput } from './domain/plan.js';
import { createStore } from './domain/store.js';
import {
  formatRange,
  fromDateInput,
  isValidDate,
  startOfSeoulDay,
} from './domain/time.js';
import { downloadText } from './utils/download.js';
import { getFirstDayOfWeek } from './scheduler/schedulerConfig.js';

const isCancelledItem = (it) =>
  it.kind !== 'block' && it.status === 'cancelled';

/** 같은 자원에서 취소 예약이 활성 일정(예약·차단)과 시간이 겹치면, 서로 위/아래 칸을 쓰도록 split 값을 붙인다. */
function markOverlapSplit(list) {
  const byRes = new Map();
  for (const it of list) {
    if (!byRes.has(it.resourceId)) byRes.set(it.resourceId, []);
    byRes.get(it.resourceId).push(it);
  }
  const split = new Map();
  for (const arr of byRes.values()) {
    const cancelled = arr.filter(isCancelledItem);
    const active = arr.filter((x) => !isCancelledItem(x));
    for (const c of cancelled) {
      for (const a of active) {
        if (a.startAt < c.endAt && c.startAt < a.endAt) {
          split.set(c, 'bottom');
          split.set(a, 'top');
        }
      }
    }
  }
  return list.map((it) =>
    split.has(it) ? { ...it, split: split.get(it) } : it
  );
}

const resourceMap = new Map(RESOURCES.map((r) => [r.id, r]));
const DAY_MS = 24 * 3600 * 1000;
let toastSeq = 1;

/**
 * 탭 내용을 한 번 연 뒤에도 유지할지 여부.
 *  true  : 일정 탭의 뷰(주간/월간)·스크롤이 탭을 오가도 유지된다. (숨겨진 Wijmo 컨트롤은 다시 보일 때 크기를 재계산한다)
 *  false : 탭을 바꿀 때마다 그 탭을 새로 만든다. (스케줄러가 일간(자원별) 뷰로 돌아간다)
 * 탭을 다시 열었을 때 스케줄러·차트가 깨져 보이면 false 로 바꿔 보세요.
 */
const KEEP_TABS_MOUNTED = true;

/** ?today=YYYY-MM-DD 로 재현용 고정 기준일 모드(서울 11:00 고정)를 제공한다. */
function makeClock() {
  const p = new URLSearchParams(window.location.search).get('today');
  const d = p ? fromDateInput(p) : null;
  return { fixed: d ? new Date(d.getTime() + 11 * 3600 * 1000) : null };
}

/** 주소에 ?demo=1 이 있으면 시연 도구(시연 시계 등)를 보여 준다. */
const isDemoMode = () =>
  new URLSearchParams(window.location.search).get('demo') === '1';

/** 내보내기 메뉴(<details>)를 항목 선택 후 닫는다. */
const closeMenu = (e) =>
  e.currentTarget.closest('details')?.removeAttribute('open');

const firstMessage = (r) =>
  r?.errors?._form ??
  Object.values(r?.errors ?? {})[0] ??
  '처리하지 못했습니다.';

export default function App() {
  const [clock] = useState(makeClock);
  const [demoMode] = useState(isDemoMode);
  const [store] = useState(() =>
    createStore({
      resources: RESOURCES,
      seed: (now) => buildSeed(startOfSeoulDay(now), now),
      clock,
      role: 'user',
    })
  );
  const st = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState
  );
  const baseDate = useMemo(() => startOfSeoulDay(store.now()), [store]);

  const [tab, setTab] = useState('schedule');
  // filters = 실제로 적용된(조회된) 조건, draft = 필터 바에서 고르는 중인 조건. '조회' 를 눌러야 draft 가 filters 로 반영된다.
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [draft, setDraft] = useState(DEFAULT_FILTERS);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [sel, setSel] = useState(null);
  const [view, setView] = useState(() => ({
    displayDate: store.now(),
    kind: 'day',
  }));
  const [layout, setLayout] = useState(null);
  // 크기 선택 드롭다운을 제거했으므로 상태가 아니라 상수로 사용한다. 기본값은 src/domain/constants.js 의 DEFAULT_LAYOUT 에서 바꾼다.
  const layoutOpts = DEFAULT_LAYOUT;
  const [dashPeriod, setDashPeriod] = useState('week');
  const [fatal, setFatal] = useState(null);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [flashIds, setFlashIds] = useState(() => new Set());
  const [, setTick] = useState(0);
  const flashTimer = useRef(null);

  const now = store.now();
  const nowMin = Math.floor(now.getTime() / 60000);
  const role = st.role;
  const admin = role === 'admin';

  // 필터를 기본값으로 되돌린다. (선택 중인 조건과 적용된 조건을 함께 초기화 → 즉시 반영)
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setDraft(DEFAULT_FILTERS);
  }, []);

  // ---- 알림 --------------------------------------------------------------
  const pushToast = useCallback((type, message, actions = []) => {
    const id = toastSeq++;
    const list = Array.isArray(actions) ? actions : [actions];
    setToasts((t) => [...t, { id, type, message, actions: list }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      list.length ? 12000 : 5000
    );
  }, []);
  const dismissToast = useCallback(
    (id) => setToasts((t) => t.filter((x) => x.id !== id)),
    []
  );
  const undoAction = useMemo(
    () => ({ label: '되돌리기', onClick: () => store.undo() }),
    [store]
  );

  // 필터 바에서 조건을 고를 때: 시작일 > 종료일(또는 종료일 < 시작일)이 되는 값은 선택할 수 없게 보정한다.
  const handleDraftChange = useCallback(
    (next) => {
      const { filters: fixed, adjusted } = clampDateRange(
        draftRef.current,
        next
      );
      setDraft(fixed);
      if (adjusted === 'from')
        pushToast(
          'info',
          '시작일은 종료일보다 늦을 수 없어 종료일로 맞췄습니다.'
        );
      else if (adjusted === 'to')
        pushToast(
          'info',
          '종료일은 시작일보다 빠를 수 없어 시작일로 맞췄습니다.'
        );
    },
    [pushToast]
  );

  const flash = useCallback((ids) => {
    if (!ids.length) return;
    setFlashIds(new Set(ids));
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashIds(new Set()), 6000);
  }, []);

  // 30초마다: 만료된 가예약 자동 해제 + 현재 시각 갱신
  useEffect(() => {
    const id = setInterval(() => {
      const expired = store.expireHolds();
      if (expired.length)
        pushToast(
          'info',
          `가예약 ${expired.length}건이 유지 시간이 지나 자동 해제되었습니다.`
        );
      setTick((t) => t + 1);
    }, 30 * 1000);
    return () => clearInterval(id);
  }, [store, pushToast]);

  // 관리자 전용 다이얼로그(차단 관리·정책 설정)가 열려 있는 상태에서 일반 사용자로 바뀌면 닫는다.
  useEffect(() => {
    if (admin) return;
    setModal((m) =>
      m && (m.type === 'blocks' || m.type === 'policy') ? null : m
    );
  }, [admin]);

  // ---- 파생 데이터 -------------------------------------------------------
  const ctx = useMemo(() => store.ctx(), [store, st]); // eslint-disable-line react-hooks/exhaustive-deps
  const issues = useMemo(() => findExistingIssues(ctx), [ctx]);
  const filtered = useMemo(
    () => applyFilters(st.bookings, RESOURCES, filters),
    [st.bookings, filters]
  );
  const lanes = useMemo(() => filterLanes(RESOURCES, filters), [filters]);
  const items = useMemo(
    () =>
      markOverlapSplit(
        toSchedulerItems({ bookings: filtered, blocks: st.blocks, lanes })
      ),
    [filtered, st.blocks, lanes]
  );
  const nonworking = useMemo(() => toNonworkingTime(st.blocks), [st.blocks]);
  const firstDay = useMemo(() => getFirstDayOfWeek(), []);
  const viewRange = useMemo(
    () => getViewRange(view.displayDate, view.kind, firstDay),
    [view, firstDay]
  );
  const dashRange = useMemo(
    () => getViewRange(view.displayDate, dashPeriod, firstDay),
    [view.displayDate, dashPeriod, firstDay]
  );
  const kpis = useMemo(
    () => computeKpis(filtered, viewRange, now, issues),
    [filtered, viewRange, nowMin, issues]
  ); // eslint-disable-line react-hooks/exhaustive-deps
  const bookers = useMemo(
    () =>
      [...new Set(st.bookings.map((b) => b.bookedBy).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, 'ko')
      ),
    [st.bookings]
  );

  const selection = useMemo(() => {
    if (!sel) return null;
    if (sel.kind === 'block') {
      const block = st.blocks.find((b) => b.id === sel.id);
      return block ? { kind: 'block', block } : null;
    }
    const booking = st.bookings.find((b) => b.id === sel.id);
    return booking ? { kind: 'booking', booking } : null;
  }, [sel, st.bookings, st.blocks]);
  const selBooking = selection?.kind === 'booking' ? selection.booking : null;
  const relations = useMemo(
    () =>
      selBooking
        ? {
            series: selBooking.seriesId
              ? st.bookings.filter((b) => b.seriesId === selBooking.seriesId)
                  .length
              : 0,
            group: selBooking.groupId
              ? st.bookings.filter((b) => b.groupId === selBooking.groupId)
                  .length
              : 0,
          }
        : null,
    [selBooking, st.bookings]
  );

  // 선택 예약이 필터에서 사라지면 상세를 닫는다.
  useEffect(() => {
    if (sel?.kind === 'booking' && !filtered.some((b) => b.id === sel.id))
      setSel(null);
  }, [filtered, sel]);

  // ---- 스케줄러 표시 크기 (DEFAULT_LAYOUT 기준) ------------------------------
  const hourOpt =
    HOUR_OPTIONS.find((o) => o.key === layoutOpts.hours) ?? HOUR_OPTIONS[0];
  const hours = useMemo(
    () => ({ start: hourOpt.start, end: hourOpt.end }),
    [hourOpt.start, hourOpt.end]
  );
  const timeAxisActive = view.kind === 'day' && layout?.key !== 'rbDay';
  const layoutStyle = useMemo(
    () => ({
      '--rb-sched-height': `${layoutOpts.height}px`,
      '--rb-px-per-hour': `${layoutOpts.scale}px`,
      '--rb-hour-span': hours.end - hours.start,
    }),
    [layoutOpts.height, layoutOpts.scale, hours]
  );

  const locked = !!modal || !!confirm;

  // 조회: 선택 중인 조건(draft)을 실제 필터로 적용한다.
  const applyDraft = useCallback(() => {
    if (locked) return;
    setFilters(draftRef.current);
  }, [locked]);
  const filtersDirty = !sameFilters(draft, filters);

  // ---- 어댑터 콜백 -------------------------------------------------------
  const onDisplayDateChange = useCallback((d) => {
    if (!d) return;
    setView((v) =>
      v.displayDate && v.displayDate.getTime() === d.getTime()
        ? v
        : { ...v, displayDate: d }
    );
  }, []);
  const onKindChange = useCallback(
    (kind) => setView((v) => (v.kind === kind ? v : { ...v, kind })),
    []
  );
  const goToday = useCallback(
    () => setView((v) => ({ ...v, displayDate: store.now() })),
    [store]
  );
  const selectItem = useCallback((item) => {
    if (!item) setSel(null);
    else if (item.kind === 'block') setSel({ kind: 'block', id: item.blockId });
    else setSel({ kind: 'booking', id: item.id });
  }, []);

  // ---- 명령: 폼 열기 ------------------------------------------------------
  const openCreate = useCallback(
    (slot) => {
      if (modal || confirm) return;
      const slotRes = slot?.resourceId
        ? resourceMap.get(slot.resourceId)
        : null;
      // 필터에서 유형/자원을 정확히 1개만 선택한 경우에만 폼 기본값으로 사용한다. (0개=전체, 2개 이상=특정 불가)
      const singleType = filters.types.length === 1 ? filters.types[0] : '';
      const singleResource =
        filters.resourceIds.length === 1 ? filters.resourceIds[0] : '';
      const type = slotRes?.type ?? singleType;
      const resourceId =
        slotRes?.id ??
        (singleResource && resourceMap.get(singleResource)?.type === type
          ? singleResource
          : '');
      let start = slot?.start;
      let end = slot?.end;
      // 월간처럼 하루 전체를 가리키는 셀은 그 날짜 09:00~10:00 으로 시작한다.
      if (isValidDate(start) && isValidDate(end) && end - start >= DAY_MS) {
        start = new Date(startOfSeoulDay(start).getTime() + 9 * 3600 * 1000);
        end = new Date(start.getTime() + 3600 * 1000);
      }
      setModal({
        type: 'booking',
        mode: 'create',
        key: `create-${Date.now()}`,
        initial: defaultDraft({
          baseDate: startOfSeoulDay(view.displayDate),
          type,
          resourceId,
          start,
          end,
        }),
      });
    },
    [modal, confirm, filters, view.displayDate]
  );

  const openEdit = useCallback(
    (id) => {
      if (modal || confirm) return;
      const b = store.getState().bookings.find((x) => x.id === id);
      if (!b) {
        pushToast(
          'info',
          '이미 삭제되었거나 존재하지 않는 예약입니다. 최신 상태를 표시합니다.'
        );
        return;
      }
      setModal({
        type: 'booking',
        mode: 'edit',
        key: `edit-${id}-${Date.now()}`,
        bookingId: id,
        initial: bookingToDraft(b, RESOURCES),
      });
    },
    [modal, confirm, store, pushToast]
  );

  const requestDelete = useCallback(
    (id) => {
      if (modal || confirm) return;
      if (!store.getState().bookings.some((x) => x.id === id)) {
        pushToast(
          'info',
          '이미 삭제되었거나 존재하지 않는 예약입니다. 최신 상태를 표시합니다.'
        );
        return;
      }
      setConfirm({ kind: 'delete', id });
    },
    [modal, confirm, store, pushToast]
  );

  // 차단 관리: 관리자 전용. 일반 사용자는 다이얼로그를 열 수 없다.
  const openBlocks = useCallback(
    (focusBlockId) => {
      if (modal || confirm) return;
      if (!admin) {
        pushToast('info', '차단 관리는 관리자 전용 기능입니다.');
        return;
      }
      setModal({ type: 'blocks', key: `blocks-${Date.now()}`, focusBlockId });
    },
    [modal, confirm, admin, pushToast]
  );

  // 정책 설정: 관리자 전용. 일반 사용자는 다이얼로그를 열 수 없다.
  const openPolicy = useCallback(() => {
    if (modal || confirm || !admin) return;
    setModal({ type: 'policy', key: `policy-${Date.now()}` });
  }, [modal, confirm, admin]);

  // ---- 명령: 저장 ---------------------------------------------------------
  const afterSave = useCallback(
    (booking, message) => {
      const visible = applyFilters(
        store.getState().bookings,
        RESOURCES,
        filters
      ).some((b) => b.id === booking.id);
      const inView =
        booking.startAt < viewRange.end && viewRange.start < booking.endAt;
      const actions = [undoAction];
      if (!visible)
        actions.unshift({
          label: '필터 초기화 후 보기',
          onClick: () => {
            resetFilters();
            setView((v) => ({ ...v, displayDate: booking.startAt }));
            setSel({ kind: 'booking', id: booking.id });
          },
        });
      else if (!inView)
        actions.unshift({
          label: '해당 날짜로 이동',
          onClick: () => {
            setView((v) => ({ ...v, displayDate: booking.startAt }));
            setSel({ kind: 'booking', id: booking.id });
          },
        });
      setSel(visible ? { kind: 'booking', id: booking.id } : null);
      pushToast(
        'success',
        `${message}${
          !visible
            ? ' (현재 필터에서는 보이지 않습니다)'
            : !inView
            ? ' (현재 표시 기간 밖입니다)'
            : ''
        }`,
        actions
      );
    },
    [store, filters, viewRange, undoAction, pushToast, resetFilters]
  );

  const handleSubmit = useCallback(
    (draftInput, { strategy, displace }) => {
      const input = draftToInput(draftInput);
      if (modal.mode === 'create') {
        const r = store.create(input, { strategy, displace });
        if (!r.ok) return r;
        setModal(null);
        const tentative = r.created.filter((b) => b.needsApproval).length;
        afterSave(
          r.created[0],
          [
            `예약 ${r.created.length}건을 등록했습니다.`,
            r.skipped.length
              ? `충돌 ${r.skipped.length}회차는 제외했습니다.`
              : '',
            r.displaced.length
              ? `가예약 ${r.displaced.length}건을 밀어냈습니다.`
              : '',
            tentative
              ? '승인이 필요한 자원은 가예약(승인 대기)으로 등록되었습니다.'
              : '',
          ]
            .filter(Boolean)
            .join(' ')
        );
        return r;
      }
      const r = store.update(modal.bookingId, input, { displace });
      if (!r.ok) {
        if (r.notFound) {
          setModal(null);
          pushToast('error', r.errors._form);
        }
        return r;
      }
      setModal(null);
      afterSave(
        r.booking,
        `예약을 수정했습니다.${
          r.displaced.length
            ? ` 가예약 ${r.displaced.length}건을 밀어냈습니다.`
            : ''
        }`
      );
      return r;
    },
    [modal, store, afterSave, pushToast]
  );

  const setStatus = useCallback(
    (id, kind) => {
      const r = store.setStatus(id, kind, {
        reason: kind === 'reject' ? '관리자 반려' : '',
      });
      const text = {
        confirm: '예약을 확정했습니다.',
        approve: '예약을 승인(확정)했습니다.',
        cancel: '예약을 취소했습니다.',
        reject: '예약을 반려(취소)했습니다.',
      }[kind];
      if (r.ok) pushToast('success', text, undoAction);
      else pushToast('error', firstMessage(r));
    },
    [store, pushToast, undoAction]
  );

  /** 일정을 끌어서 옮기거나 가장자리를 늘려 시간·자원을 바꾸는 경우: 컨트롤은 취소하고, 앱의 충돌 검증을 거쳐 통과할 때만 반영한다. */
  const handleMove = useCallback(
    ({ item, values, viewKind }) => {
      if (item.kind === 'block') {
        pushToast('info', '차단 일정은 "차단 관리"에서 수정합니다.');
        return;
      }
      const existing = store.getState().bookings.find((b) => b.id === item.id);
      if (!existing) return;
      const r = store.move(
        item.id,
        resolveMove(existing, values, { viewKind })
      );
      if (r.ok) {
        if (!r.unchanged)
          pushToast(
            'success',
            `일정을 변경했습니다: ${formatRange(
              r.booking.startAt,
              r.booking.endAt
            )}`,
            undoAction
          );
        return;
      }
      const ids = (r.conflicts ?? [])
        .filter((c) => c.booking)
        .map((c) => c.booking.id);
      flash(ids);
      pushToast('error', `일정을 변경할 수 없습니다. ${firstMessage(r)}`);
    },
    [store, pushToast, undoAction, flash]
  );

  const confirmAction = useCallback(() => {
    const c = confirm;
    setConfirm(null);
    if (!c) return;
    if (c.kind === 'delete') {
      const r = store.remove(c.id);
      if (r.ok) {
        if (sel?.id === c.id) setSel(null);
        pushToast('success', '예약을 삭제했습니다.', undoAction);
      } else
        pushToast(
          'info',
          '이미 삭제되었거나 존재하지 않는 예약입니다. 최신 상태를 표시합니다.'
        );
    } else if (c.kind === 'reset') {
      store.reset();
      resetFilters();
      setSel(null);
      setView((v) => ({ ...v, displayDate: store.now() }));
      pushToast(
        'success',
        '샘플 데이터를 초기 상태로 복원했습니다. (정책·이력·시연 시계 포함)'
      );
    }
  }, [confirm, store, sel, pushToast, undoAction, resetFilters]);

  // ---- 내보내기 -----------------------------------------------------------
  const exportCsv = () => {
    downloadText(
      '예약목록.csv',
      bookingsToCsv(filtered, RESOURCES),
      'text/csv;charset=utf-8'
    );
    pushToast(
      'success',
      `현재 필터 기준 ${filtered.length}건을 CSV로 내려받았습니다. (엑셀에서 열 수 있습니다)`
    );
  };
  const exportIcs = () => {
    downloadText(
      '예약.ics',
      bookingsToIcs(filtered, RESOURCES, { now }),
      'text/calendar;charset=utf-8'
    );
    pushToast(
      'success',
      `현재 필터 기준 ${filtered.length}건을 ICS로 내려받았습니다. (Outlook·Google 캘린더로 가져오기)`
    );
  };

  const pickIssue = useCallback(
    (b) => {
      resetFilters();
      setView((v) => ({ ...v, displayDate: b.startAt }));
      setSel({ kind: 'booking', id: b.id });
    },
    [resetFilters]
  );

  // ---- 렌더 --------------------------------------------------------------
  const filtersActive = !isDefaultFilters(filters);
  const noResult = st.bookings.length > 0 && filtered.length === 0;
  const canUndo = st.past.length > 0;
  const canRedo = st.future.length > 0;
  const undoLabel = st.past[st.past.length - 1]?.label;
  const redoLabel = st.future[st.future.length - 1]?.label;
  const deleteTarget =
    confirm?.kind === 'delete'
      ? st.bookings.find((b) => b.id === confirm.id)
      : null;

  const tabDefs = useMemo(
    () => [
      { key: 'schedule', label: '일정', icon: 'calendar' },
      { key: 'dashboard', label: '대시보드', icon: 'bar-chart' },
      {
        key: 'history',
        label: `변경 이력 (${st.log.length})`,
        icon: 'history',
      },
    ],
    [st.log.length]
  );

  const schedulePane = (
    <div className="rb-panel">
      <KpiCards
        kpis={kpis}
        viewRange={viewRange}
        kind={view.kind}
        filtersActive={filtersActive}
        dateFrom={filters.dateFrom}
        dateTo={filters.dateTo}
        onGoToday={goToday}
      />
      <IssuesPanel
        issues={issues}
        bookings={st.bookings}
        resourceMap={resourceMap}
        onPick={pickIssue}
      />
      <form
        className="rb-no-print rb-filter-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          applyDraft();
        }}
      >
        {/* 조회 버튼(type="submit")은 FilterBar 안에 있다. 이 form 의 submit 이 조회(applyDraft)를 실행한다. */}
        <FilterBar
          filters={draft}
          dirty={filtersDirty}
          resources={RESOURCES}
          bookers={bookers}
          disabled={locked}
          onChange={handleDraftChange}
          onReset={resetFilters}
          resultCount={filtered.length}
          totalCount={st.bookings.length}
        />
      </form>
      {noResult && (
        <div className="rb-banner" role="status">
          <strong>조건에 맞는 예약이 없습니다.</strong>
          <button type="button" className="rb-btn" onClick={resetFilters}>
            필터 초기화
          </button>
        </div>
      )}

      <main className="rb-main">
        <section className="rb-scheduler-card" aria-label="예약 일정">
          {fatal ? (
            <div className="rb-fatal" role="alert">
              <h2>스케줄러를 초기화하지 못했습니다.</h2>
              <p>{String(fatal?.message ?? fatal)}</p>
              <p className="rb-muted">
                설치된 @mescius/wijmo.scheduler 버전(5.20262.60)과
                라이선스/스타일 import 를 확인하세요. 브라우저 콘솔에 상세
                오류가 있습니다.
              </p>
            </div>
          ) : (
            <SchedulerAdapter
              lanes={lanes}
              items={items}
              nonworking={nonworking}
              resourceMap={resourceMap}
              displayDate={view.displayDate}
              selectedId={sel?.kind === 'booking' ? sel.id : null}
              issues={issues}
              flashIds={flashIds}
              locked={locked}
              hours={hours}
              layoutStyle={layoutStyle}
              wide={timeAxisActive}
              kind={view.kind}
              onDisplayDateChange={onDisplayDateChange}
              onKindChange={onKindChange}
              onSelect={selectItem}
              onEdit={openEdit}
              onDelete={requestDelete}
              onCreateAt={openCreate}
              onMoveRequest={handleMove}
              onBlockOpen={openBlocks}
              onReady={setLayout}
              onFatal={setFatal}
            />
          )}
          <p className="rb-hint rb-scheduler-card__hint rb-no-print">
            일정 클릭: 상세 · 더블클릭: 수정 / 빈 셀 더블클릭: 예약 등록 ·
            일정을 끌어서 시간·자원 변경(충돌·완충·차단이면 자동 거부, 충돌
            예약이 붉게 깜빡임) · 우클릭(Shift+F10): 메뉴. 빗금 일정은 점검·휴무
            차단입니다.
          </p>
        </section>

        <DetailPanel
          selection={selection}
          resource={
            selection?.kind === 'booking'
              ? resourceMap.get(selection.booking.resourceId)
              : selection?.kind === 'block'
              ? resourceMap.get(selection.block.resourceId)
              : null
          }
          issue={selBooking ? issues.get(selBooking.id) : null}
          relations={relations}
          role={role}
          canConfirm={selBooking ? store.canConfirm(selBooking) : false}
          now={now}
          open={!!selection}
          onEdit={openEdit}
          onDelete={requestDelete}
          onSetStatus={setStatus}
          onClose={() => setSel(null)}
          onRemoveBlock={(id) => {
            const r = store.removeBlock(id);
            if (r.ok) pushToast('success', '차단을 삭제했습니다.', undoAction);
            else pushToast('error', firstMessage(r));
          }}
          onOpenBlocks={() => openBlocks(selection?.block?.id)}
        />
      </main>
    </div>
  );

  const renderPane = (key) => {
    if (key === 'dashboard') {
      return (
        <DashboardTab
          bookings={st.bookings}
          resources={RESOURCES}
          log={st.log}
          range={dashRange}
          period={dashPeriod}
          onPeriodChange={setDashPeriod}
        />
      );
    }
    if (key === 'history') {
      return (
        <HistoryTab
          log={st.log}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          onUndo={() => store.undo()}
          onRedo={() => store.redo()}
        />
      );
    }
    return schedulePane;
  };

  const lockMark = !admin && (
    <Icon name="lock" size={13} className="rb-lock-ico" />
  );
  const adminOnlyTitle = admin ? '' : '관리자 전용 기능입니다.';

  return (
    <div className="rb-app">
      <header className="rb-appbar rb-no-print">
        <div className="rb-brand">
          <span className="rb-brand__mark" aria-hidden="true">
            <Icon name="calendar-check" size={24} />
          </span>
          <div className="rb-brand__text">
            <h1>리소스 예약 시스템</h1>
            <p className="rb-brand__sub">
              자원 예약 · 충돌 감지 데모 — React + Wijmo FlexScheduler
            </p>
            <p className="rb-header__meta">
              <span className="rb-chip">시간대 Asia/Seoul</span>
              <span className="rb-chip rb-chip--warn">
                메모리 샘플 · 새로고침 시 초기화
              </span>
              {clock.fixed && <span className="rb-chip">고정 기준일 모드</span>}
              {demoMode && (
                <span className="rb-chip rb-chip--accent">시연 모드</span>
              )}
              {st.offsetMs > 0 && (
                <span className="rb-chip rb-chip--warn">
                  시연 시계 +{Math.round((st.offsetMs / 3600000) * 10) / 10}h
                </span>
              )}
              {layout && (
                <span
                  className="rb-chip"
                  title={`integrity: ${layout.integrity || 'n/a'}`}
                >
                  뷰: {layout.label}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="rb-header__actions">
          <div
            role="group"
            aria-label="역할 전환"
            className="rb-seg"
            title="역할에 따라 승인·밀어내기·차단·정책 권한이 달라집니다."
          >
            {Object.entries(ROLES).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className="rb-seg__btn"
                aria-pressed={role === k}
                onClick={() => store.setRole(k)}
              >
                <Icon name={k === 'admin' ? 'shield' : 'user'} size={15} />{' '}
                {label}
              </button>
            ))}
          </div>
          <span className="rb-sep" aria-hidden="true" />
          <button
            type="button"
            className="rb-btn"
            disabled={!canUndo}
            onClick={() => store.undo()}
            title={
              undoLabel ? `되돌리기: ${undoLabel}` : '되돌릴 변경이 없습니다.'
            }
          >
            <Icon name="undo" size={15} /> 되돌리기
          </button>
          <button
            type="button"
            className="rb-btn"
            disabled={!canRedo}
            onClick={() => store.redo()}
            title={
              redoLabel
                ? `다시 실행: ${redoLabel}`
                : '다시 실행할 변경이 없습니다.'
            }
          >
            <Icon name="redo" size={15} /> 다시 실행
          </button>
          <span className="rb-sep" aria-hidden="true" />
          <button
            type="button"
            className="rb-btn"
            onClick={() => openBlocks()}
            disabled={locked || !admin}
            title={adminOnlyTitle}
          >
            <Icon name="ban" size={15} /> 차단 관리 {lockMark}
          </button>
          <button
            type="button"
            className="rb-btn"
            onClick={openPolicy}
            disabled={locked || !admin}
            title={adminOnlyTitle}
          >
            <Icon name="sliders" size={15} /> 정책 설정 {lockMark}
          </button>
          <details className="rb-menu">
            <summary className="rb-btn">
              <Icon name="download" size={15} /> 내보내기{' '}
              <Icon name="chevron-down" size={14} />
            </summary>
            <div className="rb-menu__panel">
              <button
                type="button"
                className="rb-menu__item"
                onClick={(e) => {
                  closeMenu(e);
                  exportCsv();
                }}
              >
                <Icon name="download" size={15} /> CSV (엑셀)
              </button>
              <button
                type="button"
                className="rb-menu__item"
                onClick={(e) => {
                  closeMenu(e);
                  exportIcs();
                }}
              >
                <Icon name="calendar" size={15} /> ICS (캘린더)
              </button>
              <button
                type="button"
                className="rb-menu__item"
                onClick={(e) => {
                  closeMenu(e);
                  window.print();
                }}
              >
                <Icon name="printer" size={15} /> 인쇄 / PDF 저장
              </button>
            </div>
          </details>
          <button
            type="button"
            className="rb-btn"
            onClick={() => !locked && setConfirm({ kind: 'reset' })}
          >
            <Icon name="reset" size={15} /> 샘플 초기화
          </button>
          <button
            id="btn-new-booking"
            type="button"
            className="rb-btn rb-btn--primary"
            onClick={() => openCreate()}
          >
            <Icon name="plus" size={16} /> 예약 등록
          </button>
        </div>
      </header>

      <WjTabPanel
        tabs={tabDefs}
        selectedKey={tab}
        onSelect={setTab}
        renderPane={renderPane}
        keepMounted={KEEP_TABS_MOUNTED}
      />

      {modal?.type === 'booking' && (
        <BookingFormModal
          key={modal.key}
          mode={modal.mode}
          bookingId={modal.bookingId}
          initial={modal.initial}
          resources={RESOURCES}
          bookers={bookers}
          store={store}
          storeState={st}
          role={role}
          onSubmit={handleSubmit}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'blocks' && admin && (
        <BlockManagerModal
          key={modal.key}
          store={store}
          storeState={st}
          resources={RESOURCES}
          role={role}
          baseDate={baseDate}
          focusBlockId={modal.focusBlockId}
          onToast={(type, msg, action) => pushToast(type, msg, action ?? [])}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'policy' && admin && (
        <PolicyModal
          key={modal.key}
          store={store}
          storeState={st}
          role={role}
          demoMode={demoMode}
          onToast={(type, msg) => pushToast(type, msg)}
          onClose={() => setModal(null)}
        />
      )}

      {confirm?.kind === 'delete' && deleteTarget && (
        <ConfirmDialog
          title="예약을 삭제할까요?"
          confirmLabel="삭제"
          danger
          onConfirm={confirmAction}
          onCancel={() => setConfirm(null)}
        >
          <p>
            <strong>{deleteTarget.title}</strong>
          </p>
          <p>
            {resourceMap.get(deleteTarget.resourceId)?.name} ·{' '}
            {formatRange(deleteTarget.startAt, deleteTarget.endAt)}
          </p>
          <p className="rb-muted">
            삭제하면 원본에서 제거됩니다. (취소 상태와 다릅니다) 삭제 직후에는
            되돌리기로 복원할 수 있습니다.
          </p>
        </ConfirmDialog>
      )}
      {confirm?.kind === 'reset' && (
        <ConfirmDialog
          title="샘플을 초기화할까요?"
          confirmLabel="초기화"
          danger
          onConfirm={confirmAction}
          onCancel={() => setConfirm(null)}
        >
          <p>
            모든 변경(등록·수정·삭제·차단), 정책, 변경 이력, 시연 시계가 초기
            상태로 복원됩니다. 이 작업은 되돌릴 수 없습니다.
          </p>
        </ConfirmDialog>
      )}

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
