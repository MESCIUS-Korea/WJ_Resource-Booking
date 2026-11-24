import { useEffect, useRef } from 'react';
import { InputDateTime } from '@mescius/wijmo.input';
import { decorateCalendar } from './calendarStyle.js';

const pad = (n) => String(n).padStart(2, '0');
/** 'YYYY-MM-DDTHH:mm'(서울 벽시계 문자열) → 같은 숫자를 가진 로컬 Date (브라우저 시간대와 무관하게 값 유지) */
const toDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
};
const toStr = (d) =>
  d instanceof Date && !Number.isNaN(d.getTime())
    ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}`
    : '';

/**
 * Wijmo InputDateTime 래퍼. 값은 'YYYY-MM-DDTHH:mm' 문자열(빈 값 ''). 시간 목록은 30분 단위, 직접 입력은 분 단위 가능.
 * disabled: 관리자 전용 폼을 일반 사용자에게 읽기 전용으로 보여 줄 때 쓴다.
 */
export default function WjDateTimeInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  inputRef,
  disabled,
  placeholder = 'YYYY-MM-DD HH:mm',
}) {
  const containerRef = useRef(null);
  const ctrlRef = useRef(null);
  const valueRef = useRef(value);
  const changeRef = useRef(onChange);
  const inputRefRef = useRef(inputRef);
  valueRef.current = value;
  changeRef.current = onChange;
  inputRefRef.current = inputRef;

  useEffect(() => {
    const host = document.createElement('div');
    containerRef.current.appendChild(host);
    const ctrl = new InputDateTime(host, {
      format: 'yyyy-MM-dd HH:mm',
      timeFormat: 'HH:mm',
      timeStep: 30,
      isRequired: false,
      placeholder,
      value: toDate(valueRef.current),
    });
    if (id) ctrl.inputElement.id = id;
    decorateCalendar(ctrl);
    ctrl.valueChanged.addHandler(() => {
      const next = toStr(ctrl.value);
      if (next !== valueRef.current) changeRef.current?.(next);
    });
    ctrlRef.current = ctrl;
    inputRefRef.current?.(ctrl.inputElement);
    return () => {
      inputRefRef.current?.(null);
      ctrl.dispose();
      host.remove();
      ctrlRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (ctrl && toStr(ctrl.value) !== value) ctrl.value = toDate(value);
  }, [value]);

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
      style={{ width: '100%' }}
    />
  );
}
