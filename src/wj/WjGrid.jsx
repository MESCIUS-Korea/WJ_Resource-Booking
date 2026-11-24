import { useEffect, useRef } from 'react';
import { CollectionView } from '@mescius/wijmo';
import { FlexGrid } from '@mescius/wijmo.grid';

/** FlexGrid 셀에 HTML 을 넣을 때 쓰는 이스케이프. 사용자 입력은 반드시 이 함수를 거쳐서 넣는다. */
export const esc = (v) =>
  String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const COLUMN_KEYS = [
  'binding',
  'header',
  'width',
  'minWidth',
  'maxWidth',
  'align',
  'format',
  'cssClass',
];
const toColumn = (c) => {
  const out = {};
  for (const k of COLUMN_KEYS) if (c[k] !== undefined) out[k] = c[k];
  if (c.sortable === false) out.allowSorting = false;
  return out;
};

/**
 * Wijmo FlexGrid 의 읽기 전용 목록 래퍼 (autoGenerateColumns=false + columns[{binding, header, width, format, align}] + itemsSource).
 *  - data      : 객체 배열. 내부에서 CollectionView 를 한 번만 만들고 이후에는 sourceCollection 만 바꿔 정렬 상태를 유지한다.
 *  - columns   : [{ binding, header, width, minWidth, align, format, cssClass, sortable, html(item, ctx), tooltip(item, ctx) }]
 *                html 이 있으면 formatItem 에서 셀 내용을 그 HTML 로 바꾼다. (값은 esc() 로 이스케이프해서 반환할 것)
 *  - ctx       : html/tooltip/rowClass 에 넘기는 부가 정보(예: 관리자 여부). 바뀌면 셀을 다시 그린다.
 *  - rowClass  : (item, ctx) => 문자열 | null  → 그 행의 셀에 rb-rowc-<문자열> 클래스를 붙인다. (첫 열 셀에는 rb-cell-first 도 붙는다)
 *  - headerAlign : 열 머리글 글자 정렬. 기본 'center'
 *  - onCellAction : 셀 안의 [data-rb-act] 버튼을 누르면 (act, id) 로 호출된다.
 *
 * 셀 내용을 세로 가운데로 맞추기 위해 행·머리글 높이를 CSS 변수(--rb-row-h, --rb-head-h)로 표에 넘기고,
 * styles.css 가 셀의 줄 높이(line-height)를 그 값으로 지정한다.
 */
export default function WjGrid({
  data,
  columns,
  ctx,
  rowClass,
  onCellAction,
  ariaLabel,
  height = 360,
  rowHeight = 40,
  headerHeight = 38,
  headerAlign = 'center',
}) {
  const containerRef = useRef(null);
  const gridRef = useRef(null);
  const viewRef = useRef(null);
  const hostRef = useRef(null);
  const latest = useRef({});
  latest.current = { data, columns, ctx, rowClass, onCellAction, headerAlign };

  useEffect(() => {
    const host = document.createElement('div');
    host.className = 'rb-grid';
    host.style.setProperty('--rb-row-h', `${rowHeight}px`);
    host.style.setProperty('--rb-head-h', `${headerHeight}px`);
    containerRef.current.appendChild(host);
    const view = new CollectionView(latest.current.data);
    const grid = new FlexGrid(host, {
      autoGenerateColumns: false,
      isReadOnly: true,
      headersVisibility: 'Column',
      selectionMode: 'Row',
      columns: latest.current.columns.map(toColumn),
      itemsSource: view,
    });
    grid.rows.defaultSize = rowHeight;
    grid.columnHeaders.rows.defaultSize = headerHeight;
    if (ariaLabel) host.setAttribute('aria-label', ariaLabel);

    grid.formatItem.addHandler((s, e) => {
      // 열 머리글: 글자 가운데 정렬 (CSS 로도 지정하지만 셀이 다시 그려질 때마다 확실히 적용)
      if (e.panel === s.columnHeaders) {
        const a = latest.current.headerAlign;
        if (a) e.cell.style.textAlign = a;
        return;
      }
      if (e.panel !== s.cells) return;
      const item = s.rows[e.row]?.dataItem;
      if (!item) return;
      const { columns: cols, ctx: c, rowClass: rc } = latest.current;
      const col = cols[e.col];
      if (col?.html) e.cell.innerHTML = col.html(item, c);
      if (col?.tooltip) e.cell.title = col.tooltip(item, c);
      for (const cls of Array.from(e.cell.classList))
        if (cls.startsWith('rb-rowc-')) e.cell.classList.remove(cls);
      const extra = rc?.(item, c);
      if (extra) e.cell.classList.add(`rb-rowc-${extra}`);
      if (e.col === 0) e.cell.classList.add('rb-cell-first');
      else e.cell.classList.remove('rb-cell-first');
    });

    // 셀 안 버튼은 이벤트 위임으로 처리한다. (셀은 다시 그려질 때마다 새로 만들어지므로 개별 리스너를 달지 않는다)
    const onClick = (e) => {
      const btn = e.target?.closest?.('[data-rb-act]');
      if (!btn || btn.disabled) return;
      latest.current.onCellAction?.(
        btn.getAttribute('data-rb-act'),
        btn.getAttribute('data-rb-id')
      );
    };
    host.addEventListener('click', onClick);

    gridRef.current = grid;
    viewRef.current = view;
    hostRef.current = host;
    return () => {
      host.removeEventListener('click', onClick);
      grid.dispose();
      host.remove();
      gridRef.current = null;
      viewRef.current = null;
      hostRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const view = viewRef.current;
    if (view && view.sourceCollection !== data) view.sourceCollection = data; // 처음 마운트 때는 이미 같은 배열이므로 다시 지정하지 않는다.
  }, [data]);

  useEffect(() => {
    gridRef.current?.invalidate();
  }, [ctx]);

  useEffect(() => {
    if (hostRef.current)
      hostRef.current.style.height =
        typeof height === 'number' ? `${height}px` : height;
  }, [height]);

  return (
    <div
      ref={containerRef}
      className="rb-grid-wrap"
      style={{
        '--rb-grid-height': typeof height === 'number' ? `${height}px` : height,
      }}
    />
  );
}
