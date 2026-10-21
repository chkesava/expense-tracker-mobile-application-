import { memo, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Platform,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PointerEvent,
} from "react-native";
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
import { nearestInspectableIndex, tooltipPosition } from "@/shared/utils/stockChartInspect";
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
  /** Ring around the selected-point marker, so it reads on any line colour. */
  markerRing: string;
};

const IS_WEB = Platform.OS === "web";

export type ChartKeyAction = "prev" | "next" | "first" | "last" | "dismiss";

const KEY_ACTIONS: Record<string, ChartKeyAction> = {
  ArrowLeft: "prev",
  ArrowRight: "next",
  Home: "first",
  End: "last",
  Escape: "dismiss",
};

/**
 * The SVG for one stock series (SPENDLY-558). Pure drawing: every number comes
 * from `shared/utils/stockChartGeometry`.
 *
 * Point inspection (SPENDLY-560), always resolved to the nearest bar that has
 * a value (`stockChartInspect`):
 * - touch / press-and-drag reports through `onPress`; lifting the finger
 *   calls `onRelease`, and the parent keeps the selection. A vertical drag is
 *   handed back to the parent ScrollView so the screen still scrolls;
 * - a mouse or pen hovering (web) reports through `onHover`, and leaving the
 *   plot through `onLeave`;
 * - on web the plot is focusable: arrows, Home/End and Escape go to `onKey`.
 * The parent renders the `tooltip`; this places it beside the marker.
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
  markerPrice,
  onPress,
  onRelease,
  onHover,
  onLeave,
  onKey,
  tooltip,
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
  /** Price the marker sits on; null hides the dot but keeps the guide. */
  markerPrice: number | null;
  /** `pointer` says whether a mouse or a finger pressed (see the selection reducer). */
  onPress: (index: number | null, pointer: "touch" | "mouse") => void;
  onRelease: () => void;
  onHover: (index: number | null) => void;
  onLeave: () => void;
  onKey: (action: ChartKeyAction) => void;
  tooltip: ReactNode | null;
  accessibilityLabel: string;
}) {
  const hostRef = useRef<View>(null);
  // Set from pointerdown, which fires before the responder grant. Native
  // without pointer events (and anything unknown) counts as touch.
  const pressPointer = useRef<"touch" | "mouse">("touch");
  const [tipSize, setTipSize] = useState<{ width: number; height: number } | null>(null);
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

  /** Nearest bar with a value under plot-local x, or null. */
  const barAt = (x: number) =>
    candles.length === 0 ? null : nearestInspectableIndex(candles, mode, indexAtX(x, candles.length, priceBox, mode));

  /**
   * Plot-local x. Native responder events carry it as `locationX`. On web that
   * is measured from whichever SVG node was hit, so measure from the host's
   * own box instead.
   */
  const localX = (native: { locationX?: number; clientX?: number; pageX?: number }) => {
    if (IS_WEB) {
      const node = hostRef.current as unknown as HTMLElement | null;
      const clientX = native.clientX ?? (native.pageX != null ? native.pageX - window.scrollX : undefined);
      if (node?.getBoundingClientRect && clientX != null) return clientX - node.getBoundingClientRect().left;
    }
    return native.locationX ?? 0;
  };

  const pressAt = (event: GestureResponderEvent) => onPress(barAt(localX(event.nativeEvent)), pressPointer.current);

  const isMouse = (event: PointerEvent) => {
    const type = event.nativeEvent.pointerType;
    return type === "mouse" || type === "pen";
  };

  const webProps = IS_WEB
    ? ({
        focusable: true,
        onKeyDown: (event: { key: string; preventDefault: () => void }) => {
          const action = KEY_ACTIONS[event.key];
          if (!action) return;
          event.preventDefault();
          onKey(action);
        },
      } as object)
    : null;

  if (!drawing) return <View style={{ width, height }} />;
  const { domain } = drawing;
  const right = width - box.padRight;
  const markerX = activeIndex != null ? xFor(activeIndex) : null;
  const markerY = markerPrice != null ? yForPrice(markerPrice, domain, priceBox) : null;
  const placement =
    tooltip && markerX != null && tipSize
      ? tooltipPosition({
          pointX: markerX,
          pointY: markerY ?? height / 2,
          tipWidth: tipSize.width,
          tipHeight: tipSize.height,
          areaWidth: width,
          areaHeight: height,
        })
      : null;

  return (
    <View
      ref={hostRef}
      style={{ width, height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={IS_WEB ? "Use the arrow keys to read prices, Escape to clear." : undefined}
      {...webProps}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={pressAt}
      onResponderMove={pressAt}
      // The selection stays after release, so the tooltip can be read.
      onResponderRelease={onRelease}
      onResponderTerminate={onRelease}
      onResponderTerminationRequest={() => true}
      onPointerDown={(event) => {
        pressPointer.current = isMouse(event) ? "mouse" : "touch";
      }}
      onPointerMove={(event) => {
        if (isMouse(event)) onHover(barAt(localX(event.nativeEvent)));
      }}
      onPointerLeave={(event) => {
        if (isMouse(event)) onLeave();
      }}
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

        {markerX != null ? (
          <G>
            <Line
              x1={markerX}
              x2={markerX}
              y1={box.padTop}
              y2={height - box.padBottom}
              stroke={palette.crosshair}
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.7}
            />
            {markerY != null ? (
              <Circle
                cx={markerX}
                cy={markerY}
                r={4.5}
                fill={mode === "line" ? palette.line : palette.crosshair}
                stroke={palette.markerRing}
                strokeWidth={2}
              />
            ) : null}
          </G>
        ) : null}
      </Svg>

      {tooltip && markerX != null ? (
        <View
          pointerEvents="box-none"
          onLayout={(event: LayoutChangeEvent) => {
            const { width: w, height: h } = event.nativeEvent.layout;
            if (!tipSize || Math.abs(tipSize.width - w) > 0.5 || Math.abs(tipSize.height - h) > 0.5) {
              setTipSize({ width: w, height: h });
            }
          }}
          style={{
            position: "absolute",
            left: placement?.left ?? 0,
            top: placement?.top ?? 0,
            // Hidden for the one frame before it is measured, so it never jumps.
            opacity: placement ? 1 : 0,
            maxWidth: Math.max(140, width - 8),
          }}
        >
          {tooltip}
        </View>
      ) : null}
    </View>
  );
});
