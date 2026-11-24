import * as wjCore from '@mescius/wijmo';
import * as wjScheduler from '@mescius/wijmo.scheduler';
import { RESOURCE_TYPES, STATUS, TZ } from '../domain/constants.js';
import { colorClass } from '../domain/colors.js';
import { formatTime, isValidDate } from '../domain/time.js';

export const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/** 필드 매핑: subject→title, start→startAt, end→endAt, description→description (공식 문서: 값은 "소스 속성 이름") */
export const EVENT_FIELDS = {
  subject: 'title',
  start: 'startAt',
  end: 'endAt',
  description: 'description',
};

/** 자원 레인. 자원 차원은 resourceId 하나만 사용한다. (유형은 색상/필터 용도) */
export function buildResourceDescriptors(lanes) {
  return [
    {
      fieldExpr: 'resourceId',
      label: '자원',
      dataSource: lanes,
      valueExpr: 'id',
      displayExpr: 'label',
      backgroundColorExpr: 'background',
      foreColorExpr: 'foreground',
      allowMultiple: false,
    },
  ];
}

export function getFirstDayOfWeek() {
  try {
    const f = wjCore.Globalize?.getFirstDayOfWeek;
    return typeof f === 'function' ? f.call(wjCore.Globalize) : 0;
  } catch {
    return 0;
  }
}

/**
 * 이벤트 내부 HTML. 공식 문서: 템플릿이 반환한 문자열은 이벤트 요소의 innerHTML 로 들어가므로 모든 값을 이스케이프하고,
 * 바깥 래퍼 요소는 반환하지 않는다(Scheduler 가 소유). 클릭/더블클릭은 템플릿이 아니라 hitTest 로 처리한다.
 *
 * variant: 'lane'(자원 행 뷰) | 'week' | 'month'
 * getContext() → { resourceMap, selectedId, issues(Map), flashIds(Set) }
 *
 * 사용자가 지정한 색상(item.color)은 클래스 rb-item--c-{key} 로만 전달한다. (키는 colors.js 의 고정 목록에서만 나오므로 안전하다)
 * 실제 색은 styles.css 에서 칠한다.
 */
export function createItemTemplate(getContext, variant = 'week') {
  return (ctx) => {
    const item = ctx?.item ?? {};
    const { resourceMap, selectedId, issues, flashIds } = getContext();
    const startTime = isValidDate(item.startAt) ? formatTime(item.startAt) : '';
    const endTime = isValidDate(item.endAt) ? formatTime(item.endAt) : '';

    if (item.kind === 'block') {
      const tip = `${item.title} · ${startTime}~${endTime}`;
      return `<div class="rb-item rb-item--${variant} rb-item--block" title="${escapeHtml(
        tip
      )}"><div class="rb-item__title">${escapeHtml(item.title)}</div></div>`;
    }

    const res = resourceMap.get(item.resourceId);
    const tag = res ? RESOURCE_TYPES[res.type]?.tag : '';
    const statusKey = STATUS[item.status] ? item.status : 'confirmed';
    const status = STATUS[statusKey].label;
    const issue = issues?.get(item.id);
    const cls = [
      'rb-item',
      `rb-item--${variant}`,
      `rb-item--${statusKey}`,
      colorClass(item.color),
      variant === 'lane' && item.split ? `rb-item--split-${item.split}` : '', // ← 추가
      item.id && item.id === selectedId ? 'rb-item--selected' : '',
      issue
        ? issue.level === 'conflict'
          ? 'rb-item--conflict'
          : 'rb-item--warn'
        : '',
      flashIds?.has(item.id) ? 'rb-item--flash' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const tip = [
      item.title,
      [tag, res?.name].filter(Boolean).join(' '),
      `${startTime}~${endTime}`,
      status,
      item.bookedBy,
      ...(issue?.reasons ?? []),
    ]
      .filter(Boolean)
      .join(' · ');
    const badge = `<span class="rb-badge rb-badge--${escapeHtml(
      statusKey
    )}">${escapeHtml(status)}</span>`;
    const tags = [
      item.needsApproval ? '승인대기' : '',
      item.series ? '반복' : '',
      item.group ? '묶음' : '',
      issue ? (issue.level === 'conflict' ? '충돌' : '간격') : '',
    ]
      .filter(Boolean)
      .map((t) => `<span class="rb-tag">${escapeHtml(t)}</span>`)
      .join('');

    if (variant === 'month') {
      return `<div class="${cls}" title="${escapeHtml(
        tip
      )}"><span class="rb-item__time">${escapeHtml(
        startTime
      )}</span> <span class="rb-item__title">${escapeHtml(
        item.title
      )}</span></div>`;
    }
    const meta =
      variant === 'lane'
        ? `${escapeHtml(startTime)}~${escapeHtml(endTime)} ${badge} ${tags}`
        : `${escapeHtml(res?.name ?? '')} ${badge} ${tags}`;
    return `<div class="${cls}" title="${escapeHtml(
      tip
    )}"><div class="rb-item__title">${escapeHtml(
      item.title
    )}</div><div class="rb-item__meta">${meta}</div></div>`;
  };
}

function integrityOf(def) {
  try {
    if (typeof wjScheduler.planSchedulerProjection !== 'function')
      return 'faithful';
    return (
      wjScheduler.planSchedulerProjection(def)?.integrity?.level ?? 'faithful'
    );
  } catch {
    return 'unsupported';
  }
}

/**
 * 뷰 정의 (공식 문서: createSchedulerDefinitionPreset, SchedulerDefinition, toolbarViewItems).
 *  - 일간(자원별): 행=자원, 열=시간 사용자 정의 뷰. planSchedulerProjection 으로 사전 검사해 faithful 인 정의를 우선 사용하고,
 *                  모두 지원되지 않으면 Timeline Day → Day 로 대체한다.
 *  - 주간 / 월간 : 내장 Week / Month (월간은 요약 뷰: 일정이 날짜 칸 안에 시간순으로 나열되며 크기 조정은 지원되지 않음)
 * @param {object} templates 뷰별 일정 카드 템플릿 (lane / week / month)
 * @param {object} hours 시간 축 표시 범위(시) (start / end)
 */
export function buildViewDefinitions(templates, hours = { start: 0, end: 24 }) {
  const S = wjScheduler;
  const hourBinding = {
    type: S.SchedulerAxisBindingType.Time,
    unit: S.SchedulerTimeUnit.Hour,
  };
  if (hours.start !== 0 || hours.end !== 24) {
    hourBinding.visible = (args) =>
      args.hour !== undefined &&
      args.hour >= hours.start &&
      args.hour < hours.end;
  }
  const resourceBinding = {
    type: S.SchedulerAxisBindingType.Resource,
    fieldExpr: 'resourceId',
  };
  const dayBinding = {
    type: S.SchedulerAxisBindingType.Time,
    unit: S.SchedulerTimeUnit.Day,
  };

  const resourceDay = {
    key: 'rbResourceDay',
    rows: { bindings: [resourceBinding] },
    columns: { bindings: [hourBinding] },
    cellSemantic: S.SchedulerCellSemantic.Timed,
    itemTemplate: templates.lane,
  };
  const resourceDayDated = {
    key: 'rbResourceDayDated',
    rows: { bindings: [dayBinding, resourceBinding] },
    columns: { bindings: [hourBinding] },
    cellSemantic: S.SchedulerCellSemantic.Timed,
    itemTemplate: templates.lane,
  };

  const preset = (view, fallbackKey, itemTemplate) => {
    const p = S.createSchedulerDefinitionPreset(view);
    return { ...p, key: p.key ?? fallbackKey, itemTemplate };
  };

  const mk = (def, name, label) => ({
    def,
    name,
    label,
    integrity: integrityOf(def),
  });
  const resourceLayouts = [
    mk(resourceDay, '일간 (자원별)', '자원 행 × 시간 열'),
    mk(resourceDayDated, '일간 (자원별)', '자원 행 × 시간 열 (날짜 바인딩)'),
  ].filter((c) => c.integrity !== 'unsupported');
  const fallbacks = [
    mk(
      preset(
        S.SchedulerBuiltInViewItem.TimelineDay,
        'rbTimelineDay',
        templates.lane
      ),
      '일간 (타임라인)',
      'Timeline Day (대체)'
    ),
    mk(
      preset(S.SchedulerBuiltInViewItem.Day, 'rbDay', templates.week),
      '일간',
      'Day (대체)'
    ),
  ].filter((c) => c.integrity !== 'unsupported');
  const candidates = [
    ...resourceLayouts.filter((c) => c.integrity === 'faithful'),
    ...resourceLayouts.filter((c) => c.integrity !== 'faithful'),
    ...fallbacks,
  ];

  const week = preset(
    S.SchedulerBuiltInViewItem.Week,
    'rbWeek',
    templates.week
  );
  const month = preset(
    S.SchedulerBuiltInViewItem.Month,
    'rbMonth',
    templates.month
  );
  const kindByKey = new Map(
    [...resourceLayouts, ...fallbacks].map((c) => [c.def.key, 'day'])
  );
  kindByKey.set(week.key, 'week');
  kindByKey.set(month.key, 'month');
  return { candidates, week, month, kindByKey };
}

/** 컨트롤 생성. 정의 적용에 실패하면 다음 후보로 대체하고, 모두 실패하면 예외를 던진다(빈 스케줄러를 성공처럼 보여 주지 않음). */
export function createSchedulerWithFallback(host, baseOptions, defs) {
  let lastError = null;
  for (const c of defs.candidates) {
    try {
      const toolbarViewItems = [
        { name: c.name, key: c.def.key, definition: c.def },
        { name: '주간', key: defs.week.key, definition: defs.week },
        { name: '월간', key: defs.month.key, definition: defs.month },
      ];
      const scheduler = new wjScheduler.FlexScheduler(host, {
        ...baseOptions,
        definition: c.def,
        toolbarViewItems,
      });
      return { scheduler, candidate: c };
    } catch (e) {
      lastError = e;
      try {
        wjCore.Control.getControl(host)?.dispose();
      } catch {
        /* ignore */
      }
      host.innerHTML = '';
    }
  }
  throw lastError ?? new Error('사용 가능한 Scheduler 뷰 정의가 없습니다.');
}

export function baseSchedulerOptions({
  items,
  lanes,
  displayDate,
  nonworkingTime,
}) {
  return {
    itemsSource: items,
    eventFields: EVENT_FIELDS,
    resources: buildResourceDescriptors(lanes),
    displayDate,
    timeZone: TZ,
    nonworkingTime,
    // 드래그 이동·크기 변경은 켜 두되(공식 문서: 기본 활성), 변경은 itemChanging 에서 항상 취소하고 앱의 명령(store)으로 처리한다.
    allowDragEvent: true,
    allowResizeEvent: true,
  };
}

export const MENU_ACTION = { Book: 100, View: 101, Edit: 102, Delete: 103 };

/**
 * 내장 컨텍스트 메뉴(Add/Edit/Delete)는 컨트롤 자체 CRUD 경로이므로 쓰지 않고, 같은 사용자 정의 폼/명령으로 라우팅하는 SchedulerMenu 로 교체한다.
 * (공식 문서 · 데모: SchedulerMenu 를 상속, show(position) 에서 hitTest 로 대상 확인, canExecute / executeContextMenuAction 재정의, scheduler.contextMenu 에 할당)
 */
export function installContextMenu(scheduler, getHandlers) {
  const S = wjScheduler;
  if (typeof S.SchedulerMenu !== 'function' || !S.SchedulerMenuAction)
    return null;

  class BookingMenu extends S.SchedulerMenu {
    constructor(element, sched) {
      super(element, sched);
      this.control = sched;
      this.targetCell = null;
      this.targetItem = null;
      this.itemsSource = [
        { text: '예약 등록', action: MENU_ACTION.Book, icon: 'wj-glyph-plus' },
        {
          text: '상세 보기',
          action: MENU_ACTION.View,
          icon: 'wj-glyph-circle',
        },
        { text: '수정', action: MENU_ACTION.Edit, icon: 'wj-glyph-pencil' },
        { text: '삭제', action: MENU_ACTION.Delete, icon: 'wj-glyph-minus' },
        {
          text: '오늘로 이동',
          action: S.SchedulerMenuAction.Today,
          icon: 'wj-glyph-circle',
        },
      ];
    }
    show(position) {
      const hit = this.control.hitTest(position);
      this.targetCell =
        hit.hitTestType === S.SchedulerHitTestType.Cell
          ? hit.getHitInfo()
          : null;
      this.targetItem =
        hit.hitTestType === S.SchedulerHitTestType.Item
          ? hit.getHitInfo()
          : null;
      super.show(position);
    }
    canExecute(action) {
      const h = getHandlers();
      const isBooking = this.targetItem?.item?.kind === 'booking';
      if (action === MENU_ACTION.Book) return !!this.targetCell && !h.locked;
      if (action === MENU_ACTION.View) return !!this.targetItem;
      if (action === MENU_ACTION.Edit || action === MENU_ACTION.Delete)
        return isBooking && !h.locked;
      return super.canExecute(action); // 오늘로 이동 등 내장 동작
    }
    executeContextMenuAction(action) {
      const h = getHandlers();
      const cell = this.targetCell;
      const item = this.targetItem?.item;
      if (action === MENU_ACTION.Book && cell)
        h.onCreateAt({
          start: cell.start,
          end: cell.end,
          resourceId: cell.resources?.resourceId,
        });
      else if (action === MENU_ACTION.View && item) h.onSelect(item);
      else if (action === MENU_ACTION.Edit && item) h.onEdit(item.id);
      else if (action === MENU_ACTION.Delete && item) h.onDelete(item.id);
      else super.executeContextMenuAction(action);
    }
  }

  const host = document.createElement('div');
  document.body.appendChild(host);
  scheduler.contextMenu = new BookingMenu(host, scheduler);
  return host;
}

export { wjScheduler, wjCore };
