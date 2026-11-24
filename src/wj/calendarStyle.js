import { toggleClass } from '@mescius/wijmo';

/**
 * InputDate / InputDateTime 의 달력 팝업을 꾸민다. (공식 문서: Calendar 의 formatItem 이벤트로 특정 날짜의 모양을 바꾸고,
 * wijmo.toggleClass 로 클래스를 넣는다.) 일요일·토요일 글자색은 styles.css 의 .rb-cal-sun / .rb-cal-sat 이 정한다.
 */
export function decorateCalendar(inputDate) {
  const cal = inputDate?.calendar;
  if (!cal?.formatItem) return;
  cal.formatItem.addHandler((_s, e) => {
    const d = e?.data;
    if (!(d instanceof Date)) return;
    const dow = d.getDay();
    toggleClass(e.item, 'rb-cal-sun', dow === 0);
    toggleClass(e.item, 'rb-cal-sat', dow === 6);
  });
}
