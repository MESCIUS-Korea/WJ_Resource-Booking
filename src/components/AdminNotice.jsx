import Icon from './Icon.jsx';

/** 다이얼로그 제목 옆에 붙이는 권한 배지. 관리자가 아니면 "관리자 전용 · 조회만 가능"으로 알려 준다. */
export function AdminBadge({ admin }) {
  return admin ? (
    <span className="rb-pill rb-pill--ok">
      <Icon name="shield" size={13} /> 관리자 모드
    </span>
  ) : (
    <span className="rb-pill rb-pill--lock">
      <Icon name="lock" size={13} /> 관리자 전용 · 조회만 가능
    </span>
  );
}

/**
 * 관리자 전용 기능의 경고 안내. 문장 하나를 <p> 안에 붙여서 쓰므로(아이콘 + 문단 2개 요소만 flex 로 배치)
 * 굵은 글씨와 일반 글씨 사이가 벌어지지 않는다.
 */
export default function AdminNotice({ admin, children }) {
  if (admin) return null;
  return (
    <div className="rb-notice rb-notice--warn" role="status">
      <Icon name="lock" size={18} className="rb-notice__icon" />
      <p>
        <strong>관리자 전용 기능입니다.</strong> {children}
      </p>
    </div>
  );
}
