import { useEffect, useRef } from 'react';
import { InputDate } from '@mescius/wijmo.input';
import { decorateCalendar } from './calendarStyle.js';

const pad = (n) => String(n).padStart(2, '0');
const toDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const toStr = (d) =>
  d instanceof Date && !Number.isNaN(d.getTime())
    ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    : '';

/** Wijmo InputDate 래퍼. 값은 'YYYY-MM-DD' 문자열(빈 값 ''). 달력·형식이 Wijmo 문화권(ko)을 따르고, 달력 색은 styles.css 에서 정한다. */
export default function WjDateInput({
  value,
  onChange,
  ariaLabel,
  placeholder = 'YYYY-MM-DD',
}) {
  const containerRef = useRef(null);
  const ctrlRef = useRef(null);
  const valueRef = useRef(value);
  const changeRef = useRef(onChange);
  valueRef.current = value;
  changeRef.current = onChange;

  useEffect(() => {
    const host = document.createElement('div');
    containerRef.current.appendChild(host);
    const ctrl = new InputDate(host, {
      format: 'yyyy-MM-dd',
      isRequired: false,
      placeholder,
      value: toDate(valueRef.current),
    });
    if (ariaLabel) ctrl.inputElement.setAttribute('aria-label', ariaLabel);
    decorateCalendar(ctrl);
    ctrl.valueChanged.addHandler(() => {
      const next = toStr(ctrl.value);
      if (next !== valueRef.current) changeRef.current(next);
    });
    ctrlRef.current = ctrl;
    return () => {
      ctrl.dispose();
      host.remove();
      ctrlRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (ctrl && toStr(ctrl.value) !== value) ctrl.value = toDate(value);
  }, [value]);

  return <div ref={containerRef} className="rb-xf__date" />;
}
