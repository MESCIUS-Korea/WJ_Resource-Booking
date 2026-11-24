import { useEffect, useRef } from 'react';
import {
  baseSchedulerOptions,
  buildResourceDescriptors,
  buildViewDefinitions,
  createItemTemplate,
  createSchedulerWithFallback,
  installContextMenu,
  wjScheduler,
} from './schedulerConfig.js';

/**
 * React ↔ FlexScheduler 어댑터.
 *  - 예약 원본은 store 하나이며, 이 컴포넌트는 파생된 표시용 투영(items)·레인(lanes)·비근무 시간만 받아 재바인딩한다.
 *  - 컨트롤의 생성/수정/삭제 경로(내장 편집기·컨텍스트 메뉴·키보드)는 사용하지 않는다. itemChanging 에서 모든 요청을 취소하고,
 *    드래그 이동·크기 변경(Update) 요청만 onMoveRequest 로 전달해 앱의 검증(충돌·완충·차단)을 거치게 한다.
 *    (공식 문서: itemChanging 에서 args.cancel = true 이면 원본 항목은 변경되지 않으며 상호작용은 취소 상태로 유지된다)
 *  - 클릭/더블클릭은 렌더링된 DOM 조각이 아니라 hitTest → getHitInfo() 의 원본 항목으로 처리한다.
 *  - 일정을 클릭하면 선택, 빈 셀을 클릭하면 선택 해제(onSelect(null)) 한다. 헤더·코너·스크롤바 클릭은 선택을 바꾸지 않는다.
 *  - 터치(손가락·펜)에서는 브라우저가 dblclick 을 보내지 않는 경우가 있으므로, 같은 위치를 빠르게 두 번 탭하는 "더블 탭"을
 *    직접 감지해 더블클릭과 같은 동작(빈 셀 = 예약 등록, 일정 = 수정/차단 열기)을 한다. 마우스는 기존 dblclick 그대로 쓴다.
 *  - 시간 축 표시 범위(hours)가 바뀌면 뷰 정의를 새로 적용해야 하므로 컨트롤을 다시 만든다.
 */

// 더블 탭 판정: 두 번째 탭까지의 시간(ms), 두 탭 사이 최대 거리(px), 탭 중 최대 이동 거리(px: 넘으면 스크롤로 보고 무시)
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DIST = 30;
const TAP_MOVE_MAX = 10;
// 같은 동작이 이 시간 안에 두 번 들어오면(더블 탭 + 브라우저가 만든 dblclick) 한 번만 처리한다.
const ACTION_GUARD_MS = 600;

export default function SchedulerAdapter({
  lanes,
  items,
  nonworking,
  resourceMap,
  displayDate,
  selectedId,
  issues,
  flashIds,
  locked,
  hours,
  layoutStyle,
  wide,
  kind,
  onDisplayDateChange,
  onKindChange,
  onSelect,
  onEdit,
  onDelete,
  onCreateAt,
  onMoveRequest,
  onBlockOpen,
  onReady,
  onFatal,
}) {
  const containerRef = useRef(null);
  const schedulerRef = useRef(null);
  const kindRef = useRef('day');

  const latest = useRef({});
  latest.current = {
    lanes,
    items,
    nonworking,
    resourceMap,
    displayDate,
    selectedId,
    issues,
    flashIds,
    locked,
    onDisplayDateChange,
    onKindChange,
    onSelect,
    onEdit,
    onDelete,
    onCreateAt,
    onMoveRequest,
    onBlockOpen,
    onReady,
    onFatal,
  };

  useEffect(() => {
    const container = containerRef.current;
    const host = document.createElement('div');
    host.className = 'rb-scheduler-host';
    container.appendChild(host);

    let scheduler = null;
    let menuHost = null;
    const L = () => latest.current;
    const cleanups = [];

    try {
      const ctx = () => ({
        resourceMap: L().resourceMap,
        selectedId: L().selectedId,
        issues: L().issues,
        flashIds: L().flashIds,
      });
      const templates = {
        lane: createItemTemplate(ctx, 'lane'),
        week: createItemTemplate(ctx, 'week'),
        month: createItemTemplate(ctx, 'month'),
      };
      const defs = buildViewDefinitions(templates, hours);
      const created = createSchedulerWithFallback(
        host,
        baseSchedulerOptions({
          items: L().items,
          lanes: L().lanes,
          displayDate: L().displayDate,
          nonworkingTime: L().nonworking,
        }),
        defs
      );
      scheduler = created.scheduler;
      schedulerRef.current = scheduler;
      kindRef.current = 'day';

      L().onReady?.({
        key: created.candidate.def.key,
        label: created.candidate.label,
        integrity: created.candidate.integrity,
      });
      L().onKindChange?.('day');

      const dateHandler = (s) => L().onDisplayDateChange?.(s.displayDate);
      const defHandler = (s) => {
        const k = defs.kindByKey.get(s.definition?.key) ?? 'day';
        kindRef.current = k;
        L().onKindChange?.(k);
      };
      scheduler.displayDateChanged.addHandler(dateHandler);
      scheduler.definitionChanged.addHandler(defHandler);
      cleanups.push(() => {
        scheduler.displayDateChanged.removeHandler(dateHandler);
        scheduler.definitionChanged.removeHandler(defHandler);
      });

      // 컨트롤 자체 커밋은 모두 취소. 드래그 이동·크기 변경만 앱 명령으로 전달한다. (값은 소스 항목 속성 이름 기준)
      const changing = (_s, args) => {
        args.cancel = true;
        const req = args.request;
        if (
          req?.action === wjScheduler.SchedulerItemChangeAction.Update &&
          req.item
        ) {
          const item = req.item;
          const values = { ...(req.values ?? {}) };
          // Wijmo 의 상호작용 처리가 끝난 뒤 React 상태를 바꾼다.
          setTimeout(
            () =>
              L().onMoveRequest?.({ item, values, viewKind: kindRef.current }),
            0
          );
        }
      };
      scheduler.itemChanging.addHandler(changing);
      cleanups.push(() => scheduler.itemChanging.removeHandler(changing));

      menuHost = installContextMenu(scheduler, () => ({
        locked: L().locked,
        onCreateAt: L().onCreateAt,
        onSelect: L().onSelect,
        onEdit: L().onEdit,
        onDelete: L().onDelete,
      }));

      const hitOf = (e) => {
        try {
          const hit = scheduler.hitTest(e);
          const type = hit.hitTestType;
          if (
            type === wjScheduler.SchedulerHitTestType.Item ||
            type === wjScheduler.SchedulerHitTestType.Cell
          ) {
            const info = hit.getHitInfo();
            if (info) return { type, info };
          }
        } catch {
          /* hit test 결과 없음은 정상 */
        }
        return null;
      };

      // 더블클릭(마우스)과 더블 탭(터치)이 같은 동작을 두 번 실행하지 않게 하는 보호 장치
      let lastAction = 0;
      const guard = () => {
        const t = Date.now();
        if (t - lastAction < ACTION_GUARD_MS) return false;
        lastAction = t;
        return true;
      };

      // 더블클릭/더블 탭이 가리키는 위치에서 할 일: 일정 = 수정(차단은 차단 관리), 빈 셀 = 예약 등록
      const activate = (h) => {
        if (L().locked) return;
        if (!guard()) return;
        if (h.type === wjScheduler.SchedulerHitTestType.Item) {
          const it = h.info.item;
          if (it?.kind === 'block') L().onBlockOpen?.(it.blockId);
          else L().onEdit?.(it?.id);
        } else {
          L().onCreateAt?.({
            start: h.info.start,
            end: h.info.end,
            resourceId: h.info.resources?.resourceId,
          });
        }
      };

      // 일정 위에서 시작한 누름(드래그 이동·크기 조절)이 끝난 뒤 발생하는 click 은 빈 셀 클릭으로 취급하지 않는다.
      let downOnItem = false;
      // 터치 더블 탭 감지용
      let tapDown = null;
      let lastTap = { t: 0, x: 0, y: 0 };

      const onPointerDown = (e) => {
        downOnItem = !!(
          e.target instanceof Element && e.target.closest('.wj-scheduler-item')
        );
        tapDown =
          e.pointerType === 'mouse' ? null : { x: e.clientX, y: e.clientY };
      };

      const onPointerUp = (e) => {
        if (e.pointerType === 'mouse' || !tapDown) return;
        const moved = Math.hypot(e.clientX - tapDown.x, e.clientY - tapDown.y);
        tapDown = null;
        if (moved > TAP_MOVE_MAX) return; // 스크롤·드래그는 탭이 아니다.

        const now = Date.now();
        const isDouble =
          now - lastTap.t < DOUBLE_TAP_MS &&
          Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) <
            DOUBLE_TAP_DIST;
        lastTap = isDouble
          ? { t: 0, x: 0, y: 0 }
          : { t: now, x: e.clientX, y: e.clientY };
        if (!isDouble) return;

        const h = hitOf(e);
        if (h) activate(h);
      };

      const onPointerCancel = () => {
        tapDown = null; // 브라우저가 스크롤로 가져간 제스처는 탭이 아니다.
      };

      const onClick = (e) => {
        const h = hitOf(e);
        if (!h) return; // 헤더·코너·스크롤바 등: 선택을 바꾸지 않는다.
        if (h.type === wjScheduler.SchedulerHitTestType.Item) {
          L().onSelect?.(h.info.item ?? null);
          return;
        }
        // 빈 셀: 선택 해제 → 상세 패널이 '일정을 선택하세요' 안내로 돌아간다.
        if (downOnItem || L().locked) return;
        L().onSelect?.(null);
      };

      // capture 단계에서 가로채 내장 편집기가 열리지 않게 한다. (툴바 등 일반 더블클릭은 통과)
      const onDblClick = (e) => {
        const h = hitOf(e);
        if (!h) return;
        e.stopPropagation();
        e.preventDefault();
        activate(h);
      };

      container.addEventListener('pointerdown', onPointerDown, true);
      container.addEventListener('pointerup', onPointerUp, true);
      container.addEventListener('pointercancel', onPointerCancel, true);
      container.addEventListener('click', onClick);
      container.addEventListener('dblclick', onDblClick, true);
      cleanups.push(() => {
        container.removeEventListener('pointerdown', onPointerDown, true);
        container.removeEventListener('pointerup', onPointerUp, true);
        container.removeEventListener('pointercancel', onPointerCancel, true);
        container.removeEventListener('click', onClick);
        container.removeEventListener('dblclick', onDblClick, true);
      });
    } catch (e) {
      console.error('[FlexScheduler] 초기화 실패', e);
      L().onFatal?.(e);
    }

    return () => {
      cleanups.forEach((fn) => {
        try {
          fn();
        } catch {
          /* ignore */
        }
      });
      try {
        scheduler?.dispose();
      } catch {
        /* ignore */
      }
      schedulerRef.current = null;
      menuHost?.remove();
      host.remove();
    };
  }, [hours.start, hours.end]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = schedulerRef.current;
    if (s) s.resources = buildResourceDescriptors(lanes);
  }, [lanes]);

  useEffect(() => {
    const s = schedulerRef.current;
    if (s) s.itemsSource = items;
  }, [items]);

  useEffect(() => {
    const s = schedulerRef.current;
    if (s) s.nonworkingTime = nonworking;
  }, [nonworking]);

  useEffect(() => {
    const s = schedulerRef.current;
    if (!s || !displayDate) return;
    const cur = s.displayDate;
    if (!cur || cur.getTime() !== displayDate.getTime())
      s.displayDate = displayDate;
  }, [displayDate]);

  // 선택·충돌 강조가 바뀌면 템플릿을 다시 그린다.
  useEffect(() => {
    const s = schedulerRef.current;
    if (!s) return;
    try {
      s.refresh();
    } catch {
      /* ignore */
    }
  }, [selectedId, issues, flashIds]);

  useEffect(() => {
    const s = schedulerRef.current;
    if (s) s.isDisabled = !!locked;
  }, [locked]);

  useEffect(() => {
    const s = schedulerRef.current;
    if (!s) return undefined;
    const id = requestAnimationFrame(() => {
      try {
        s.invalidate?.();
      } catch {
        /* ignore */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [layoutStyle, wide, kind]);

  return (
    <div
      ref={containerRef}
      className="rb-scheduler-wrap"
      data-wide={wide ? 'true' : 'false'}
      data-kind={kind}
      style={layoutStyle}
    />
  );
}
