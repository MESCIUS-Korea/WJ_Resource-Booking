import { useEffect, useRef } from 'react';
import { MultiSelect } from '@mescius/wijmo.input';

/**
 * Wijmo MultiSelect 의 React 래퍼.
 *  - options  : [{ value, label }]
 *  - values   : 체크된 value 배열 (옵션 순서로 정규화되어 onChange 로 전달)
 */
export default function WjMultiSelect({
  options,
  values,
  onChange,
  disabled,
  ariaLabel,
  width = '100%',
  placeholder = '전체',
  headerFormat = '{count:n0}개 선택',
}) {
  const containerRef = useRef(null);
  const ctrlRef = useRef(null);
  const syncing = useRef(false);
  const sigRef = useRef(null);
  const itemsRef = useRef([]); // checkedItems 는 itemsSource 의 "같은 객체"여야 하므로 참조를 보관
  const latest = useRef({});
  latest.current = { values, onChange, options };

  const sig = JSON.stringify(options.map((o) => [o.value, o.label]));
  const valuesKey = values.join('|');

  useEffect(() => {
    const host = document.createElement('div');
    containerRef.current.appendChild(host);
    const ctrl = new MultiSelect(host, {
      displayMemberPath: 'label',
      placeholder,
      headerFormat,
      maxHeaderItems: 3,
      showSelectAllCheckbox: false,
    });
    if (ariaLabel) ctrl.inputElement.setAttribute('aria-label', ariaLabel);
    ctrl.checkedItemsChanged.addHandler(() => {
      if (syncing.current) return;
      const picked = new Set(ctrl.checkedItems.map((i) => i.value));
      const next = latest.current.options
        .map((o) => o.value)
        .filter((v) => picked.has(v));
      if (next.join('|') !== latest.current.values.join('|'))
        latest.current.onChange?.(next);
    });
    ctrlRef.current = ctrl;
    sigRef.current = null;
    return () => {
      ctrl.dispose();
      host.remove();
      ctrlRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    syncing.current = true;
    try {
      if (sigRef.current !== sig) {
        itemsRef.current = options.map((o) => ({
          value: o.value,
          label: o.label,
        }));
        ctrl.itemsSource = itemsRef.current;
        sigRef.current = sig;
      }
      const want = new Set(values);
      const desired = itemsRef.current.filter((i) => want.has(i.value));
      const current = ctrl.checkedItems.map((i) => i.value).join('|');
      if (current !== desired.map((i) => i.value).join('|'))
        ctrl.checkedItems = desired;
    } finally {
      syncing.current = false;
    }
  }, [sig, valuesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ctrlRef.current) ctrlRef.current.isDisabled = !!disabled;
  }, [disabled]);

  return <div ref={containerRef} className="rb-wjc" style={{ width }} />;
}
