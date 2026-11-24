import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Control } from '@mescius/wijmo';
import { Tab, TabPanel } from '@mescius/wijmo.nav';
import { iconSvg } from '../components/icons.js';

/**
 * Wijmo TabPanel 의 React 래퍼.
 * 공식 문서: tabs.deferUpdate() 안에서 헤더(<a>)와 패널(<div>) 요소를 만들어 tabs.push(new Tab(header, pane)) 로 추가하고,
 * selectedIndex / selectedIndexChanged 로 선택 탭을 읽고 쓴다.
 * React 내용은 Wijmo 가 관리하는 패널 요소에 createPortal 로 그린다.
 *
 *  - tabs          : [{ key, label, icon }]  (키 목록이 바뀌면 TabPanel 을 다시 만들고, label 만 바뀌면 헤더 글자만 바꾼다)
 *  - selectedKey / onSelect(key)
 *  - renderPane(key) : 그 탭의 React 내용
 *  - keepMounted   : true  → 한 번이라도 연 탭은 숨겨도 유지(스케줄러 뷰·필터 등 상태 유지)
 *                    false → 선택된 탭만 그리고 나머지는 해제(탭을 바꿀 때마다 새로 만듦)
 */
export default function WjTabPanel({
  tabs,
  selectedKey,
  onSelect,
  renderPane,
  keepMounted = true,
}) {
  const wrapRef = useRef(null);
  const ctrlRef = useRef(null);
  const headersRef = useRef({});
  const syncing = useRef(false);
  const tabsRef = useRef(tabs);
  const latest = useRef({});
  tabsRef.current = tabs;
  latest.current = { onSelect, selectedKey };
  const [panes, setPanes] = useState({});
  const [visited, setVisited] = useState(() => new Set([selectedKey]));
  const structureKey = tabs.map((t) => t.key).join('|');

  useEffect(() => {
    const host = document.createElement('div');
    wrapRef.current.appendChild(host);
    const ctrl = new TabPanel(host, { isAnimated: false });
    host.classList.add('rb-tabs-host');

    const nextPanes = {};
    const headers = {};
    ctrl.tabs.deferUpdate(() => {
      for (const t of tabsRef.current) {
        const a = document.createElement('a');
        a.innerHTML = `<span class="rb-tabhdr">${iconSvg(
          t.icon,
          16
        )}<span class="rb-tabhdr__label"></span></span>`;
        a.querySelector('.rb-tabhdr__label').textContent = t.label;
        const pane = document.createElement('div');
        pane.className = 'rb-tabpane-body';
        ctrl.tabs.push(new Tab(a, pane));
        nextPanes[t.key] = pane;
        headers[t.key] = a;
      }
    });
    headersRef.current = headers;

    const idx = Math.max(
      0,
      tabsRef.current.findIndex((t) => t.key === latest.current.selectedKey)
    );
    syncing.current = true;
    ctrl.selectedIndex = idx;
    syncing.current = false;
    ctrl.selectedIndexChanged.addHandler(() => {
      if (syncing.current) return;
      const t = tabsRef.current[ctrl.selectedIndex];
      if (t) latest.current.onSelect?.(t.key);
    });

    ctrlRef.current = ctrl;
    setPanes(nextPanes);
    return () => {
      ctrl.dispose();
      host.remove();
      ctrlRef.current = null;
      headersRef.current = {};
    };
  }, [structureKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 부모가 선택 탭을 바꾼 경우 컨트롤에 반영하고, 숨겨져 있던 Wijmo 컨트롤(스케줄러·차트·그리드)의 크기를 다시 계산한다.
  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return undefined;
    const idx = tabsRef.current.findIndex((t) => t.key === selectedKey);
    if (idx >= 0 && ctrl.selectedIndex !== idx) {
      syncing.current = true;
      ctrl.selectedIndex = idx;
      syncing.current = false;
    }
    setVisited((prev) =>
      prev.has(selectedKey) ? prev : new Set(prev).add(selectedKey)
    );
    const pane = panes[selectedKey];
    const id = requestAnimationFrame(() => {
      try {
        if (pane) Control.invalidateAll(pane);
      } catch {
        /* 크기 재계산 실패는 화면 동작에 영향이 없으므로 무시 */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [selectedKey, panes]);

  // 헤더 글자(예: "변경 이력 (3)")만 바뀐 경우
  useEffect(() => {
    for (const t of tabs) {
      const el = headersRef.current[t.key]?.querySelector('.rb-tabhdr__label');
      if (el && el.textContent !== t.label) el.textContent = t.label;
    }
  }, [tabs, panes]);

  return (
    <div ref={wrapRef} className="rb-tabpanel">
      {tabs.map((t) => {
        const pane = panes[t.key];
        const show = keepMounted
          ? visited.has(t.key) || t.key === selectedKey
          : t.key === selectedKey;
        return pane && show
          ? createPortal(renderPane(t.key), pane, t.key)
          : null;
      })}
    </div>
  );
}
