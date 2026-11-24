import { useEffect, useRef } from 'react';
import { MultiSelect } from '@mescius/wijmo.input';

/**
 * Wijmo MultiSelect(체크박스 다중 선택) 의 React 래퍼.
 *
 * - value    : 선택된 값 배열. 빈 배열 = 전체 (필터 없음)
 * - options  : [{ value, label }]
 * - onChange : 새 선택 배열. 전부 체크하거나 전부 해제하면 [] (= 전체) 를 돌려준다.
 * - allLabel : 전체 상태일 때 헤더에 보이는 문구 (예: '전체 유형')
 * - showFilter : 드롭다운 안에 검색 입력창 표시 (항목이 많을 때)
 *
 * v2 수정: 컨트롤에 넣은 항목 객체를 렌더링마다 새로 만들면 체크 상태와 값이 어긋나
 *          선택이 즉시 반영되지 않던 문제를 고침. 항목 객체는 옵션이 바뀔 때만 다시 만든다.
 */
export default function WjCheckSelect({
  id,
  value,
  options,
  onChange,
  allLabel = '전체',
  ariaLabel,
  disabled,
  showFilter = false,
  inputRef,
  width = '100%',
}) {
  const containerRef = useRef(null);
  const ctrlRef = useRef(null);
  const syncing = useRef(false); // 코드에서 체크 상태를 맞추는 동안의 이벤트는 무시
  const sigRef = useRef(null); // 마지막으로 컨트롤에 반영한 옵션 서명
  const itemsRef = useRef([]); // 컨트롤이 실제로 들고 있는 항목 객체 (옵션이 바뀔 때만 교체)
  const latest = useRef({});
  latest.current = { value, onChange, allLabel, inputRef, options };

  const sig = JSON.stringify(options.map((o) => [String(o.value), o.label]));
  const valueSig = JSON.stringify(value ?? []);

  // 전체(0개 또는 전부 체크)이면 '전체' 문구, 일부이면 이름 또는 'N개 선택'
  const updateHeader = (ctrl) => {
    const n = ctrl.checkedItems.length;
    const total = itemsRef.current.length;
    if (n === 0 || n === total) {
      ctrl.maxHeaderItems = 0;
      ctrl.headerFormat = latest.current.allLabel;
    } else {
      ctrl.maxHeaderItems = 2;
      ctrl.headerFormat = '{count:n0}개 선택';
    }
  };

  // 1) 생성 / 해제
  useEffect(() => {
    const host = document.createElement('div');
    containerRef.current.appendChild(host);

    const ctrl = new MultiSelect(host, {
      displayMemberPath: 'label',
      isEditable: false,
      showSelectAllCheckbox: true,
      selectAllLabel: '전체 선택',
      showFilterInput: showFilter,
      placeholder: latest.current.allLabel,
      maxDropDownHeight: 260,
    });
    if (id) ctrl.inputElement.id = id;
    if (ariaLabel) ctrl.inputElement.setAttribute('aria-label', ariaLabel);

    ctrl.checkedItemsChanged.addHandler(() => {
      if (syncing.current) return;
      updateHeader(ctrl);
      const checked = new Set(ctrl.checkedItems);
      // 컨트롤이 들고 있는 항목(itemsRef) 기준으로 비교 → 옵션 순서 유지
      const picked = itemsRef.current.filter((i) => checked.has(i));
      const next =
        picked.length === itemsRef.current.length
          ? []
          : picked.map((i) => i.value);
      if (JSON.stringify(next) !== JSON.stringify(latest.current.value ?? [])) {
        latest.current.onChange?.(next);
      }
    });

    ctrlRef.current = ctrl;
    sigRef.current = null; // StrictMode 재마운트 시 옵션을 다시 채우도록 초기화
    latest.current.inputRef?.(ctrl.inputElement);

    return () => {
      latest.current.inputRef?.(null);
      ctrl.dispose();
      host.remove();
      ctrlRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) 옵션 / 값 동기화
  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    syncing.current = true;
    try {
      if (sigRef.current !== sig) {
        itemsRef.current = latest.current.options.map((o) => ({
          key: String(o.value),
          value: o.value,
          label: o.label,
        }));
        ctrl.itemsSource = itemsRef.current;
        sigRef.current = sig;
      }
      const want = new Set((latest.current.value ?? []).map(String));
      if (want.size === 0) {
        // 값이 '전체'일 때 컨트롤이 0개 또는 전부 체크 상태면 그대로 둔다
        // (사용자가 '전체 선택'을 눌렀거나 모두 해제한 상태를 되돌리지 않기 위함)
        const n = ctrl.checkedItems.length;
        if (n !== 0 && n !== itemsRef.current.length) ctrl.checkedItems = [];
      } else {
        ctrl.checkedItems = itemsRef.current.filter((i) => want.has(i.key));
      }
      updateHeader(ctrl);
    } finally {
      syncing.current = false;
    }
  }, [sig, valueSig, allLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ctrlRef.current) ctrlRef.current.isDisabled = !!disabled;
  }, [disabled]);

  return <div className="rb-wjc" style={{ width }} ref={containerRef} />;
}
