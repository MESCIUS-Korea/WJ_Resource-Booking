import { useEffect, useRef } from 'react';
import { AutoComplete } from '@mescius/wijmo.input';

/**
 * Wijmo AutoComplete 의 React 래퍼 (자유 입력 + 후보 자동완성). 목록에 없는 값도 그대로 입력할 수 있다.
 *  - value / onChange : 입력 텍스트,  items : 자동완성 후보 문자열 배열
 */
export default function WjAutoComplete({
  id,
  value,
  items,
  onChange,
  disabled,
  invalid,
  describedBy,
  ariaLabel,
  inputRef,
  width = '100%',
  placeholder,
}) {
  const containerRef = useRef(null);
  const ctrlRef = useRef(null);
  const syncing = useRef(false);
  const sigRef = useRef(null);
  const latest = useRef({});
  latest.current = { value, onChange, inputRef };

  const sig = JSON.stringify(items);

  useEffect(() => {
    const host = document.createElement('div');
    containerRef.current.appendChild(host);
    const ctrl = new AutoComplete(host, {
      isEditable: true,
      isRequired: false,
      minLength: 1,
      maxItems: 20,
      placeholder,
    });
    if (id) ctrl.inputElement.id = id;
    if (ariaLabel) ctrl.inputElement.setAttribute('aria-label', ariaLabel);
    // 타이핑·목록 선택·포커스 이동 어느 경우든 현재 텍스트를 React 상태로 동기화
    const pull = () => {
      if (syncing.current) return;
      const t = ctrl.text ?? '';
      if (t !== (latest.current.value ?? '')) latest.current.onChange?.(t);
    };
    ctrl.textChanged.addHandler(pull);
    ctrl.selectedIndexChanged.addHandler(pull);
    ctrl.lostFocus.addHandler(pull);
    ctrlRef.current = ctrl;
    sigRef.current = null;
    latest.current.inputRef?.(ctrl.inputElement);
    return () => {
      latest.current.inputRef?.(null);
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
        ctrl.itemsSource = items;
        sigRef.current = sig;
      }
      if ((ctrl.text ?? '') !== (value ?? '')) ctrl.text = value ?? '';
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
