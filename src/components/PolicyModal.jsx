import { useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import AdminNotice, { AdminBadge } from './AdminNotice.jsx';
import WjNumber from '../wj/WjNumber.jsx';
import { RESOURCE_TYPES } from '../domain/constants.js';
import { formatDateTime } from '../domain/time.js';

/**
 * 정책 설정(관리자) + 시연 도구.
 *  - 완충 시간: 같은 자원의 예약과 예약 사이에 비워 둘 최소 시간. 올리면 이미 저장된 예약 중 간격이 부족한 것이 "간격 경고"로 표시된다.
 *  - 가예약 유지 시간: 이 시간 안에 확정하지 않으면 자동 취소된다.
 *  - 가예약 밀어내기: 관리자가 확정 예약을 넣을 때 겹치는 가예약을 취소할 수 있는지 여부
 *  - 시연 도구(demoMode, 주소에 ?demo=1): 현재 시각을 앞당겨 가예약 자동 만료를 바로 확인한다. 실제 업무 기능이 아니다.
 */
export default function PolicyModal({ store, storeState, role, demoMode, onToast, onClose }) {
  const admin = role === 'admin';
  const rules = storeState.rules;
  const [form, setForm] = useState(() => ({
    equipment: rules.bufferMinutes.equipment,
    room: rules.bufferMinutes.room,
    worker: rules.bufferMinutes.worker,
    ttl: rules.tentativeTtlHours,
    displace: rules.allowDisplace,
  }));
  const now = store.now();

  const save = (e) => {
    e.preventDefault();
    if (!admin) return;
    const r = store.setRules({
      bufferMinutes: { equipment: form.equipment, room: form.room, worker: form.worker },
      tentativeTtlHours: form.ttl,
      allowDisplace: form.displace,
    });
    if (r.ok) onToast('success', '정책을 저장했습니다. 간격이 부족해진 기존 예약은 "확인 필요"에 표시됩니다.');
    else onToast('error', r.errors?._form ?? '저장하지 못했습니다.');
  };
  const advance = (minutes, label) => {
    const expired = store.advanceClock(minutes);
    onToast('info', `시연 시계를 ${label} 앞당겼습니다.${expired.length ? ` 가예약 ${expired.length}건이 만료되어 자동 해제되었습니다.` : ''}`);
  };

  return (
    <Modal
      title={<span className="rb-modal-title">정책 설정{demoMode ? ' · 시연 도구' : ''} <AdminBadge admin={admin} /></span>}
      titleId="policy-title"
      size="md"
      onClose={onClose}
      footer={<button type="button" className="rb-btn" onClick={onClose} data-autofocus>닫기</button>}
    >
      <AdminNotice admin={admin}>아래 정책은 조회만 할 수 있습니다. 값을 바꾸려면 화면 오른쪽 위 역할 전환에서 &apos;관리자&apos;를 선택하세요.</AdminNotice>

      <p className="rb-lead">예약을 받을 때 적용하는 규칙입니다. 저장하면 이후 예약부터 바로 적용되고, 이미 저장된 예약 중 새 규칙과 어긋나는 것은 "확인이 필요한 예약"에 표시됩니다.</p>

      <form onSubmit={save} noValidate>
        <fieldset className="rb-fieldset" disabled={!admin}>
          <legend className="rb-sr-only">정책 입력</legend>

          <section className="rb-section">
            <h3 className="rb-h3">완충 시간 (분)</h3>
            <p className="rb-help">같은 자원의 예약과 예약 사이에 비워 둘 최소 시간입니다. 예) 설비 15분이면 10:00에 끝난 예약 뒤에는 10:15부터 예약할 수 있습니다.</p>
            <div className="rb-form-grid rb-form-grid--3">
              {['equipment', 'room', 'worker'].map((t) => (
                <div className="rb-field" key={t}>
                  <label htmlFor={`p-${t}`}>{RESOURCE_TYPES[t].label}</label>
                  <WjNumber id={`p-${t}`} ariaLabel={`${RESOURCE_TYPES[t].label} 완충 시간`} value={form[t]} min={0} max={240} step={5} isRequired disabled={!admin} onChange={(v) => setForm((f) => ({ ...f, [t]: v ?? 0 }))} />
                </div>
              ))}
            </div>
          </section>

          <section className="rb-section">
            <h3 className="rb-h3">가예약 유지 시간 (시간)</h3>
            <p className="rb-help">가예약은 이 시간 안에 확정하지 않으면 자동으로 취소되어 자리가 풀립니다.</p>
            <div className="rb-field rb-field--narrow">
              <label htmlFor="p-ttl" className="rb-sr-only">가예약 유지 시간</label>
              <WjNumber id="p-ttl" ariaLabel="가예약 유지 시간" value={form.ttl} min={1} max={720} isRequired disabled={!admin} onChange={(v) => setForm((f) => ({ ...f, ttl: v ?? 1 }))} />
            </div>
          </section>

          <section className="rb-section">
            <h3 className="rb-h3">가예약 밀어내기</h3>
            <p className="rb-help">관리자가 확정 예약을 넣을 때, 시간이 겹치는 것이 가예약뿐이면 그 가예약을 취소하고 자리를 차지할 수 있게 할지 정합니다. 확정 예약과 겹치면 밀어낼 수 없습니다.</p>
            <label className="rb-check">
              <input type="checkbox" checked={form.displace} disabled={!admin} onChange={(e) => setForm((f) => ({ ...f, displace: e.target.checked }))} />
              관리자의 확정 예약이 겹치는 가예약을 밀어낼 수 있음
            </label>
          </section>
        </fieldset>

        <div className="rb-block-form__actions">
          <button type="submit" className="rb-btn rb-btn--primary" disabled={!admin} title={admin ? '' : '관리자만 저장할 수 있습니다.'}>
            <Icon name={admin ? 'check' : 'lock'} size={15} /> 정책 저장
          </button>
        </div>
      </form>

      {demoMode && (
        <section className="rb-section rb-demo">
          <h3 className="rb-h3"><Icon name="clock" size={16} /> 시연 도구</h3>
          <p className="rb-help">시연용입니다. 현재 시각을 앞당겨 가예약의 자동 만료를 바로 보여 줍니다. 실제 업무에는 쓰지 않으며 예약 데이터의 시각은 바뀌지 않습니다.</p>
          <p className="rb-muted">현재(시연) 시각: <strong>{formatDateTime(now)}</strong>{storeState.offsetMs ? ` · 실제보다 ${Math.round((storeState.offsetMs / 3600000) * 10) / 10}시간 앞당김` : ''}</p>
          <div className="rb-block-form__actions">
            <button type="button" className="rb-btn" onClick={() => advance(60, '1시간')}>+1시간</button>
            <button type="button" className="rb-btn" onClick={() => advance(24 * 60, '1일')}>+1일</button>
            <button type="button" className="rb-btn rb-btn--ghost" onClick={() => { store.resetClock(); onToast('info', '시연 시계를 처음 상태로 되돌렸습니다.'); }}><Icon name="reset" size={15} /> 시계 초기화</button>
          </div>
        </section>
      )}
    </Modal>
  );
}
