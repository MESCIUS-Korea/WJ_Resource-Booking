import { ICON_PATHS } from './icons.js';

/** 단순 선 아이콘. 장식용이므로 스크린 리더에서는 숨기고, 의미는 옆의 텍스트가 전달한다. */
export default function Icon({ name, size = 16, className = '' }) {
  return (
    <svg
      className={`rb-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] ?? '' }}
    />
  );
}
