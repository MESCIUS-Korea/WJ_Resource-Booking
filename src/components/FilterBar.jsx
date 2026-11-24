import { useState } from 'react';
import { RESOURCE_TYPES, STATUS } from '../domain/constants.js';
import { reconcileResource } from '../domain/filters.js';
import WjCombo from '../wj/WjCombo.jsx';
import WjMultiSelect from '../wj/WjMultiSelect.jsx';
import WjAutoComplete from '../wj/WjAutoComplete.jsx';
import WjDateInput from '../wj/WjDateInput.jsx';
import WjCheckSelect from '../wj/WjCheckSelect.jsx';
import { resourcesForTypes, reconcileResourceIds } from '../domain/multiFilter.js';

const TYPE_OPTIONS = Object.entries(RESOURCE_TYPES).map(([k, v]) => ({ value: k, label: v.label }));
const STATUS_OPTIONS = Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label }));

export default function FilterBar({ filters, dirty, resources, bookers, disabled, onChange, onReset, resultCount, totalCount }) {
  const [open, setOpen] = useState(false);

  const set = (patch) => onChange(reconcileResourceIds({ ...filters, ...patch }, resources));
  const resourceOptions = resourcesForTypes(resources, filters.types).map((r) => ({
  value: r.id,
  label: `${r.name}${r.isAvailable ? '' : ' (사용 불가)'}`,
}));

const bookerOptions = bookers.map((b) => ({ value: b, label: b }));

  return (
    <section className="rb-filters" aria-label="필터">
      <fieldset disabled={disabled} className="rb-filters__fieldset">
        <legend className="rb-sr-only">예약 필터</legend>
        <div className="rb-xf">
          <div className="rb-xf__item">
            <span className="rb-xf__label">유형</span>
<WjCheckSelect ariaLabel="유형" width={170} allLabel="전체 유형"
  value={filters.types} options={TYPE_OPTIONS} disabled={disabled}
  onChange={(v) => set({ types: v })} />          </div>
          <div className="rb-xf__item">
            <span className="rb-xf__label">자원</span>
<WjCheckSelect ariaLabel="자원" width={230} allLabel="전체 자원" showFilter
  value={filters.resourceIds} options={resourceOptions} disabled={disabled}
  onChange={(v) => set({ resourceIds: v })} />          </div>
          <button type="button" className="rb-btn rb-btn--ghost" aria-expanded={open} aria-controls="more-filters" onClick={() => setOpen((v) => !v)}>
            추가 필터 {open ? '접기' : '펼치기'}
          </button>
          <button type="button" className="rb-btn rb-btn--ghost" onClick={onReset}>필터 초기화</button>
          <button type="submit" className={`rb-btn rb-btn--primary${dirty ? ' is-dirty' : ''}`} disabled={disabled} title={dirty ? '선택한 조건이 아직 적용되지 않았습니다' : '조회'} >
           조회
          </button>
          <span className="rb-xf__count" role="status">{resultCount} / {totalCount}건 표시</span>
        </div>

        {open && (
          <div id="more-filters" className="rb-xf rb-xf--more">
            <div className="rb-xf__item">
              <span className="rb-xf__label">상태</span>
              <WjMultiSelect ariaLabel="상태 (여러 개 선택 가능)" width={200} disabled={disabled} placeholder="전체 상태" options={STATUS_OPTIONS} values={filters.statuses} onChange={(v) => set({ statuses: v })} />
            </div>
            <div className="rb-xf__item">
              <span className="rb-xf__label">예약자</span>
<WjCheckSelect ariaLabel="예약자" width={190} allLabel="전체 예약자" showFilter
  value={filters.bookedBy} options={bookerOptions} disabled={disabled}
  onChange={(v) => set({ bookedBy: v })} />            </div>
            <label className="rb-xf__item">
              <span className="rb-xf__label">제목/설명</span>
              <input className="rb-xf__control rb-xf__control--text" type="search" value={filters.text} onChange={(e) => set({ text: e.target.value })} placeholder="검색어" />
            </label>
            <div className="rb-xf__item" role="group" aria-label="날짜 범위">
              <span className="rb-xf__label">시작일</span>
              <WjDateInput value={filters.dateFrom} ariaLabel="시작일" onChange={(v) => set({ dateFrom: v })} />
              <span className="rb-xf__sep" aria-hidden="true">~</span>
              <span className="rb-xf__label">종료일</span>
              <WjDateInput value={filters.dateTo} ariaLabel="종료일" onChange={(v) => set({ dateTo: v })} />
            </div>
          </div>
        )}
      </fieldset>
    </section>
  );
}
