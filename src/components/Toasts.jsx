import Icon from './Icon.jsx';

/** 토스트: actions 로 여러 개의 동작 버튼(예: "해당 날짜로 이동", "되돌리기")을 둘 수 있다. */
export default function Toasts({ toasts, onDismiss }) {
  return (
    <div
      className="rb-toasts rb-no-print"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rb-toast rb-toast--${t.type}`}
          role={t.type === 'error' ? 'alert' : 'status'}
        >
          <span className="rb-toast__msg">{t.message}</span>
          {(t.actions ?? []).map((a) => (
            <button
              key={a.label}
              type="button"
              className="rb-link-btn"
              onClick={() => {
                a.onClick();
                onDismiss(t.id);
              }}
            >
              {a.label}
            </button>
          ))}
          <button
            type="button"
            className="rb-icon-btn"
            aria-label="알림 닫기"
            onClick={() => onDismiss(t.id)}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
