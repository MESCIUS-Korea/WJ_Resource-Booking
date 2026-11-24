import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Control } from '@mescius/wijmo';
import { Popup, PopupTrigger } from '@mescius/wijmo.input';
import Icon from './Icon.jsx';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Wijmo Popup 기반 모달 대화상자.
 * 공식 문서: 소유자 요소가 없는 Popup 은 화면 중앙에 뜨는 대화상자이며 show(true) 로 모달로 연다.
 * 대화상자는 기본적으로 Esc 를 누르거나 포커스를 잃으면 닫히는데, 안의 Wijmo 드롭다운 패널은 <body> 에 붙어 포커스를 가져가므로
 * hideTrigger 를 None 으로 두고 hiding 이벤트에서 Wijmo 자체 닫기를 취소한다. 닫는 시점은 앱(onClose)이 정한다. (저장하지 않은 변경 확인 등)
 * React 내용은 Popup 호스트 요소에 createPortal 로 그린다.
 * title 은 문자열 또는 React 요소(배지 포함)를 받을 수 있다.
 */
export default function Modal({ title, titleId, onClose, children, footer, size = 'md', role = 'dialog' }) {
  const [host, setHost] = useState(null);
  const frameRef = useRef(null);
  const closingRef = useRef(false);
  const escGuard = useRef(false);
  const latest = useRef({});
  latest.current = { onClose };

  // 2) Popup 생성·표시. (선언 순서가 중요: 언마운트 때 정리 함수는 선언 순서대로 실행되므로, Popup 을 먼저 닫고 호스트 요소를 제거한다)
  useEffect(() => {
    if (!host) return undefined;
    closingRef.current = false;
    const prev = document.activeElement;
    const popup = new Popup(host, {
      modal: true,
      hideTrigger: PopupTrigger.None,
      fadeIn: false,
      fadeOut: false,
    });
    if (titleId) popup.ariaLabelledBy = titleId;
    // Wijmo 가 스스로 닫으려는 시도(Esc 등)는 취소한다. 앱이 정한 방식으로만 닫힌다.
    popup.hiding.addHandler((_s, e) => {
      if (!closingRef.current) e.cancel = true;
    });
    popup.show(true);
    const t = setTimeout(() => {
      const el = frameRef.current;
      (el?.querySelector('[data-autofocus]') ?? el?.querySelector(FOCUSABLE) ?? el)?.focus?.();
    }, 0);
    return () => {
      clearTimeout(t);
      closingRef.current = true;
      try {
        popup.hide();
      } catch {
        /* 이미 숨겨졌거나 요소가 제거된 경우 */
      }
      try {
        popup.dispose();
      } catch {
        /* ignore */
      }
      const target = prev && document.contains(prev) ? prev : document.getElementById('btn-new-booking');
      target?.focus?.();
    };
  }, [host]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1) Popup 호스트 요소 (본문에 붙여 두면 Popup 이 표시/숨김을 관리한다)
  useEffect(() => {
    const el = document.createElement('div');
    el.className = `rb-dialog rb-dialog--${size}`;
    document.body.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 캡처 단계: Wijmo 가 Esc 로 드롭다운을 닫기 "전에" 열려 있었는지 기록
  const onKeyDownCapture = (e) => {
    if (e.key !== 'Escape') return;
    const hostEl = e.target?.closest?.('.wj-control');
    const ctrl = hostEl ? Control.getControl(hostEl) : null;
    escGuard.current = !!(ctrl && (ctrl.isDroppedDown || ctrl.inputTime?.isDroppedDown));
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (escGuard.current) {
        escGuard.current = false; // 드롭다운만 닫는다.
        return;
      }
      latest.current.onClose?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = Array.from(frameRef.current.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (nodes.length === 0) return;
    const firstEl = nodes[0];
    const lastEl = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };

  if (!host) return null;
  return createPortal(
    <div ref={frameRef} className="rb-dialog__frame" role={role} aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDownCapture={onKeyDownCapture} onKeyDown={onKeyDown}>
      <div className="rb-modal__header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="rb-icon-btn" onClick={onClose} aria-label="닫기"><Icon name="x" size={18} /></button>
      </div>
      <div className="rb-modal__body">{children}</div>
      {footer && <div className="rb-modal__footer">{footer}</div>}
    </div>,
    host,
  );
}
