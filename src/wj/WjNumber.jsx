import { useEffect, useRef } from 'react';
import { InputNumber } from '@mescius/wijmo.input';

/**
 * Wijmo InputNumber 래퍼. 빈 값은 null. (isRequired=false 라야 값을 지울 수 있다)
 *  - value / onChange(number | null), min, max, step, format('n0' = 정수)
 */
export default function WjNumber({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = 'n0',
  disabled,
  invalid,
  describedBy,
  ariaLabel,
  inputRef,
  width = '100%',
  placeholder,
  isRequired = false,
}) {
  const containerRef = useRef(null);
  const ctrlRef = useRef(null);
  const syncing = useRef(false);
  const latest = useRef({});
  latest.current = { value, onChange, inputRef };

  useEffect(() => {
    const host = document.createElement('div');
    containerRef.current.appendChild(host);
    const ctrl = new InputNumber(host, {
      min,
      max,
      step,
      format,
      isRequired,
      placeholder,
      value: value ?? null,
    });
    if (id) ctrl.inputElement.id = id;
    if (ariaLabel) ctrl.inputElement.setAttribute('aria-label', ariaLabel);
    ctrl.valueChanged.addHandler(() => {
      if (syncing.current) return;
      const v = ctrl.value;
      const next = v == null || Number.isNaN(v) ? null : v;
      if (next !== (latest.current.value ?? null))
        latest.current.onChange?.(next);
    });
    ctrlRef.current = ctrl;
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
      if ((ctrl.value ?? null) !== (value ?? null)) ctrl.value = value ?? null;
    } finally {
      syncing.current = false;
    }
  }, [value]);

  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    ctrl.isDisabled = !!disabled;
    ctrl.min = min;
    ctrl.max = max;
  }, [disabled, min, max]);

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
