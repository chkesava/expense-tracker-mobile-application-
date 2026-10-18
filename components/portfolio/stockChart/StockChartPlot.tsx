import { memo, useMemo } from "react";
import { View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

import type { StockCandle, StockHistoryRange } from "@/shared/types/market";
import {
  buildCandleGeometry,
  buildLineGeometry,
  indexAtX,
  priceDomain,
  priceTicks,
  timeTickIndices,
  xForLineIndex,
  xForSlot,
  yForPrice,
  type ChartBox,
  type ChartMode,
} from "@/shared/utils/stockChartGeometry";
import { formatAxisTick } from "@/shared/utils/stockHistory";

const VOLUME_HEIGHT = 34;
const VOLUME_GAP = 6;

export type StockChartPalette = {
  line: string;
  bull: string;
  bear: string;
  grid: string;
  label: string;
  crosshair: string;
};

/**
 * The SVG for one stock series (SPENDLY-558). Pure drawing: every number comes
 * from `shared/utils/stockChartGeometry`. Touch-and-drag reports the bar under
 * the finger through `onScrub`; a vertical drag is handed back to the parent
 * ScrollView so the screen still scrolls.
 */
export const StockChartPlot = memo(function StockChartPlot({
  candles,
  mode,
  range,
  gmtOffsetSec,
  baseline,
  width,
  height,
  palette,
  formatPrice,
  activeIndex,
  onScrub,
  accessibilityLabel,
}: {
  candles: StockCandle[];
  mode: ChartMode;
  range: StockHistoryRange;
  gmtOffsetSec: number;
  /** Dashed reference line (the previous close on 1D). */
  baseline: number | null;
  width: number;
  height: number;
  palette: StockChartPalette;
  formatPrice: (value: number) => string;
  activeIndex: number | null;
  onScrub: (index: number | null) => void;
  accessibilityLabel: string;
}) {
  const box: ChartBox = useMemo(
    () => ({ width, height, padTop: 10, padBottom: 22, padLeft: 2, padRight: 58 }),
    [width, height]
  );
  const showVolume = mode === "candle" && candles.some((candle) => (candle.v ?? 0) > 0);
  const priceBox: ChartBox = useMemo(
    () => (showVolume ? { ...box, padBottom: box.padBottom + VOLUME_HEIGHT + VOLUME_GAP } : box),
    [box, showVolume]
  );

  const drawing = useMemo(() => {
    const domain = priceDomain(candles, mode, mode === "line" ? baseline : null);
    if (!domain || width <= 0) return null;
    return {
      domain,
      line: mode === "line" ? buildLineGeometry(candles, domain, priceBox) : null,
      candle: mode === "candle" ? buildCandleGeometry(candles, domain, priceBox) : null,
      volume: showVolume ? buildCandleGeometry(candles, domain, box, VOLUME_HEIGHT).volume : [],
      ticks: priceTicks(domain, 4),
      timeTicks: timeTickIndices(candles.length, width < 340 ? 3 : 4),
    };
  }, [baseline, box, candles, mode, priceBox, showVolume, width]);

  const xFor = (index: number) =>
    mode === "line" ? xForLineIndex(index, candles.length, priceBox) : xForSlot(index, candles.length, priceBox);

  const scrubTo = (event: GestureResponderEvent) => {
    if (candles.length === 0) return;
    onScrub(indexAtX(event.nativeEvent.locationX, candles.length, priceBox, mode));
  };

  if (!drawing) return <View style={{ width, height }} />;
  const { domain } = drawing;
  const right = width - box.padRight;
  const active = activeIndex != null ? candles[activeIndex] : undefined;
  const activePrice = active?.c ?? null;

  return (
    <View
      style={{ width, height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={scrubTo}
      onResponderMove={scrubTo}
      onResponderRelease={() => onScrub(null)}
      onResponderTerminate={() => onScrub(null)}
      onResponderTerminationRequest={() => true}
    >
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="stockArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.line} stopOpacity={0.22} />
            <Stop offset="1" stopColor={palette.line} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {drawing.ticks.map((tick) => {
          const y = yForPrice(tick, domain, priceBox);
          return (
            <G key={`p${tick}`}>
              <Line x1={box.padLeft} x2={right} y1={y} y2={y} stroke={palette.grid} strokeWidth={1} strokeDasharray="2 4" />
              <SvgText x={width - 4} y={y + 4} fontSize={10} fill={palette.label} textAnchor="end">
                {formatPrice(tick)}
              </SvgText>
            </G>
          );
        })}

        {drawing.timeTicks.map((index, i, all) => (
          <SvgText
            key={`t${index}`}
            x={xFor(index)}
            y={height - 6}
            fontSize={10}
            fill={palette.label}
            textAnchor={i === 0 ? "start" : i === all.length - 1 ? "end" : "middle"}
          >
            {formatAxisTick(candles[index].t, range, gmtOffsetSec)}
          </SvgText>
        ))}

        {mode === "line" && baseline != null ? (
          <Line
            x1={box.padLeft}
            x2={right}
            y1={yForPrice(baseline, domain, priceBox)}
            y2={yForPrice(baseline, domain, priceBox)}
            stroke={palette.label}
            strokeWidth={1}
            strokeDasharray="4 4"
            opacity={0.6}
          />
        ) : null}

        {drawing.line ? (
          <G>
            {drawing.line.areas.map((d, i) => (
              <Path key={`a${i}`} d={d} fill="url(#stockArea)" />
            ))}
            {drawing.line.segments.map((d, i) => (
              <Path key={`s${i}`} d={d} stroke={palette.line} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            ))}
          </G>
        ) : null}

        {drawing.volume.map((bar) => (
          <Rect
            key={`v${bar.index}`}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            fill={bar.bullish ? palette.bull : palette.bear}
            opacity={0.28}
          />
        ))}

        {drawing.candle?.candles.map((c) => {
          const color = c.bullish ? palette.bull : palette.bear;
          return (
            <G key={`c${c.index}`}>
              <Line x1={c.x} x2={c.x} y1={c.wickTop} y2={c.wickBottom} stroke={color} strokeWidth={1} />
              <Rect x={c.bodyX} y={c.bodyY} width={c.bodyWidth} height={c.bodyHeight} fill={color} />
            </G>
          );
        })}

        {activeIndex != null ? (
          <G>
            <Line
              x1={xFor(activeIndex)}
              x2={xFor(activeIndex)}
              y1={box.padTop}
              y2={height - box.padBottom}
              stroke={palette.crosshair}
              strokeWidth={1}
            />
            {activePrice != null ? (
              <Circle
                cx={xFor(activeIndex)}
                cy={yForPrice(activePrice, domain, priceBox)}
                r={4}
                fill={mode === "line" ? palette.line : palette.crosshair}
              />
            ) : null}
          </G>
        ) : null}
      </Svg>
    </View>
  );
});
