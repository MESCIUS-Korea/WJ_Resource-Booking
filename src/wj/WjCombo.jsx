import { useEffect, useRef } from 'react';
import { ComboBox } from '@mescius/wijmo.input';

// 빈 문자열('')도 하나의 선택지로 쓸 수 있도록 내부 키로 치환한다.
const EMPTY = '__empty__';
const toKey = (v) => (v === '' || v == null ? EMPTY : String(v));
const fromKey = (k) => (k == null || k === EMPTY ? '' : k);

/**
 * Wijmo ComboBox 의 React 래퍼 (네이티브 <select> 대체).
 *  - value / onChange : 선택 값. onChange 는 항상 "문자열" 키를 돌려준다(숫자 옵션은 호출부에서 Number 로 변환).
 *  - options          : [{ value, label }]  (value '' 허용 → "선택 안 함" 항목)
 */
export default function WjCombo({
  id,
  value,
  options,
  onChange,
  disabled,
  invalid,
  describedBy,
  ariaLabel,
  inputRef,
  width = '100%',
}) {
  const containerRef = useRef(null);
  const ctrlRef = useRef(null);
  const syncing = useRef(false); // 프로그램에서 값을 맞추는 동안 발생하는 이벤트는 무시
  const sigRef = useRef(null); // 마지막으로 컨트롤에 반영한 옵션 서명
  const latest = useRef({});
  latest.current = { value, onChange, inputRef };

  const items = options.map((o) => ({ key: toKey(o.value), label: o.label }));
  const sig = JSON.stringify(items);

  useEffect(() => {
    const host = document.createElement('div');
    containerRef.current.appendChild(host);
    const ctrl = new ComboBox(host, {
      displayMemberPath: 'label',
      selectedValuePath: 'key',
      isRequired: true, // 선택지 목록 안의 값만 허용 ("선택 안 함"은 '' 항목으로 표현)
      isEditable: false,
    });
    if (id) ctrl.inputElement.id = id;
    if (ariaLabel) ctrl.inputElement.setAttribute('aria-label', ariaLabel);
    ctrl.selectedIndexChanged.addHandler(() => {
      if (syncing.current) return;
      const next = fromKey(ctrl.selectedValue);
      if (toKey(next) !== toKey(latest.current.value))
        latest.current.onChange?.(next);
    });
    ctrlRef.current = ctrl;
    sigRef.current = null; // StrictMode 재마운트 시 옵션을 다시 채우도록 초기화
    latest.current.inputRef?.(ctrl.inputElement);
    return () => {
      latest.current.inputRef?.(null);
      ctrl.dispose();
      host.remove();
      ctrlRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 옵션 내용이 바뀐 경우에만 itemsSource 를 교체해 열린 드롭다운이 닫히지 않게 한다.
  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    syncing.current = true;
    try {
      if (sigRef.current !== sig) {
        ctrl.itemsSource = items;
        sigRef.current = sig;
      }
      const key = toKey(value);
      if (ctrl.selectedValue !== key) ctrl.selectedValue = key;
    } finally {
      syncing.current = false;
    }
  }, [sig, value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ctrlRef.current) ctrlRef.current.isDisabled = !!disabled;
  }, [disabled]);

  useEffect(() => {
    const el = ctrlRef.current?.inputElement;
    if (!el) return;
    if (invalid) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
    if (describedBy) el.setAttribute('aria-describedby', describedBy);
    else el.removeAttribute('aria-describedby');
  }, [invalid, describedBy]);

  return (
    <div
      ref={containerRef}
      className={`rb-wjc${invalid ? ' rb-wjc--invalid' : ''}`}
      style={{ width }}
    />
  );
}
