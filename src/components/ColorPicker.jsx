import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { EVENT_COLORS, colorOf } from '../domain/colors.js';

/** 태그 모양 아이콘. 색이 없으면(기본) 회색 윤곽선만 그린다. */
function TagIcon({ color, size = 16 }) {
  const c = colorOf(color);
  const stroke = c ? c.accent : '#8a949e';
  return (
    <svg className="rb-colorpick__tag" width={size} height={size} viewBox="0 0 24 24" fill={c ? c.bg : 'none'} stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill={stroke} />
    </svg>
  );
}

/** 선택 항목: 맨 위 '기본' + 색상 6개 */
const OPTIONS = [{ key: '', label: '기본 (자원 유형 색)' }, ...EVENT_COLORS.map((c) => ({ key: c.key, label: `${c.label} 범주` }))];
const ROW_H = 36; // 메뉴 한 줄 높이(대략). 위/아래 열림 판단에만 쓴다.

/**
 * Outlook 의 '범주' 드롭다운 같은 일정 색상 선택.
 *   value    : 색상 키 ('' = 기본)
 *   onChange : (key) => void
 *
 * - 메뉴는 이 컴포넌트 안쪽(position: absolute)에 그린다. 모달(Wijmo Popup)의 transform 안에서는
 *   position: fixed 가 화면 기준이 되지 않고, 모달 밖으로 포커스가 나가면 닫힐 수 있기 때문이다.
 * - 아래 공간이 모자라면 위로 연다.
 * - 키보드: ↑↓ 이동, Home/End, Enter/Space 선택, Esc 닫기(모달이 같이 닫히지 않도록 전파를 막는다), Tab 닫기.
 */
export default function ColorPicker({ id, value = '', onChange, disabled = false, ariaLabel = '일정 색상' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const listId = useId();

  const selectedIndex = Math.max(0, OPTIONS.findIndex((o) => o.key === (value || '')));
  const current = OPTIONS[selectedIndex];

  const latest = useRef({});
  latest.current = { open, active, disabled, onChange, selectedIndex };

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  }, []);

  const choose = useCallback(
    (i) => {
      const opt = OPTIONS[i];
      if (opt) latest.current.onChange?.(opt.key);
      close(true);
    },
    [close],
  );

  const openMenu = useCallback(() => {
    if (latest.current.disabled || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const host = btnRef.current.closest('.rb-modal__body');
    const limit = host ? host.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const menuH = OPTIONS.length * ROW_H + 14;
    const below = limit.bottom - r.bottom;
    const above = r.top - limit.top;
    setUp(below < menuH && above > below);
    setActive(latest.current.selectedIndex);
    setOpen(true);
  }, []);

  // 열리면 메뉴에 포커스
  useEffect(() => {
    if (open) menuRef.current?.focus();
  }, [open]);

  // 키보드 (네이티브 이벤트: 모달 쪽 Esc 처리보다 먼저 받아 전파를 막기 위함)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const last = OPTIONS.length - 1;
    const onKey = (e) => {
      const s = latest.current;
      if (!s.open) {
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target === btnRef.current) {
          e.preventDefault();
          openMenu();
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); e.stopPropagation(); setActive(s.active >= last ? 0 : s.active + 1); break;
        case 'ArrowUp': e.preventDefault(); e.stopPropagation(); setActive(s.active <= 0 ? last : s.active - 1); break;
        case 'Home': e.preventDefault(); e.stopPropagation(); setActive(0); break;
        case 'End': e.preventDefault(); e.stopPropagation(); setActive(last); break;
        case 'Enter':
        case ' ': e.preventDefault(); e.stopPropagation(); choose(s.active); break;
        case 'Escape': e.preventDefault(); e.stopPropagation(); close(true); break;
        case 'Tab': close(false); break;
        default: break;
      }
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, [openMenu, choose, close]);

  // 바깥을 누르거나 창 크기가 바뀌면 닫기
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  return (
    <div className="rb-colorpick" ref={rootRef}>
      <button
        ref={btnRef}
        id={id}
        type="button"
        className="rb-colorpick__btn"
        aria-label={`${ariaLabel}: ${current.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : openMenu())}
      >
        <TagIcon color={value} />
        <span className="rb-colorpick__name">{current.label}</span>
        <svg className="rb-colorpick__caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {open && (
        <ul
          ref={menuRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel}
          aria-activedescendant={`${listId}-${active}`}
          className={`rb-colorpick__menu${up ? ' rb-colorpick__menu--up' : ''}`}
        >
          {OPTIONS.map((o, i) => (
            <li key={o.key || 'default'} role="presentation">
              {i === 1 && <div className="rb-colorpick__sep" role="separator" />}
              <div
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.key === (value || '')}
                data-active={i === active}
                className="rb-colorpick__opt"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
              >
                <TagIcon color={o.key} />
                <span>{o.label}</span>
                {o.key === (value || '') && (
                  <svg className="rb-colorpick__check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5" /></svg>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
