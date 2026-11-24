import { useEffect, useRef } from 'react';
import * as wjChart from '@mescius/wijmo.chart';

/**
 * Wijmo FlexChart 래퍼 (공식 문서: itemsSource + bindingX + series[{binding, name}], chartType, stacking, legend, axisX/axisY).
 *  - type / stacking / palette / axisX / axisY / legend : 기본 옵션
 *  - tooltip       : 툴팁 내용을 만드는 함수 (ht) => HTML 문자열. (chart.tooltip.content 에 HitTestInfo 를 받는 함수 지정)
 *  - itemFormatter : 막대 같은 차트 항목을 그릴 때 호출되는 함수 (engine, ht, defaultRenderer).
 *  - tooltipClass  : 툴팁에 추가할 CSS 클래스 (Tooltip.cssClass)
 * 차트의 구성이 바뀌면 컨트롤을 다시 만들고, 데이터나 함수만 바뀌면 itemsSource 교체 / 다시 그리기만 한다.
 */
export default function WjChart({
  data, bindingX, series, type = 'Column', stacking = 'None', palette, axisX, axisY, header, ariaLabel, height = 280, legend = true,
  tooltip, itemFormatter, tooltipClass = 'rb-chart-tip',
}) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const dataRef = useRef(data);
  const fnRef = useRef({});
  dataRef.current = data;
  fnRef.current = { tooltip, itemFormatter };
  const configKey = JSON.stringify({ bindingX, series, type, stacking, palette, axisX, axisY, header, legend, tooltipClass, hasTip: !!tooltip, hasFmt: !!itemFormatter });

  useEffect(() => {
    const host = document.createElement('div');
    host.style.height = '100%';
    containerRef.current.appendChild(host);
    const chart = new wjChart.FlexChart(host, {
      chartType: wjChart.ChartType[type] ?? wjChart.ChartType.Column,
      stacking: wjChart.Stacking[stacking] ?? wjChart.Stacking.None,
      bindingX,
      series: series.map((s) => ({ binding: s.binding, name: s.name })),
      itemsSource: dataRef.current,
      legend: { position: legend ? wjChart.Position.Bottom : wjChart.Position.None },
      header,
      ...(palette ? { palette } : {}),
      ...(axisX ? { axisX } : {}),
      ...(axisY ? { axisY } : {}),
      ...(ariaLabel ? { ariaLabel } : {}),
    });
    if (fnRef.current.tooltip) {
      chart.tooltip.content = (ht) => fnRef.current.tooltip?.(ht) ?? '';
      if (tooltipClass) chart.tooltip.cssClass = tooltipClass;
    }
    if (fnRef.current.itemFormatter) {
      chart.itemFormatter = (engine, ht, defaultRenderer) => {
        const fn = fnRef.current.itemFormatter;
        if (fn) fn(engine, ht, defaultRenderer);
        else defaultRenderer();
      };
    }
    chartRef.current = chart;
    return () => {
      chart.dispose();
      host.remove();
      chartRef.current = null;
    };
  }, [configKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (chartRef.current) chartRef.current.itemsSource = data;
  }, [data]);

  // 함수(예: 피크 값을 담은 itemFormatter)만 바뀐 경우 차트를 다시 그린다.
  useEffect(() => {
    const c = chartRef.current;
    if (c && (itemFormatter || tooltip)) {
      try {
        c.invalidate();
      } catch {
        /* ignore */
      }
    }
  }, [itemFormatter, tooltip]);

  return <div ref={containerRef} className="rb-chart" style={{ height }} />;
}
