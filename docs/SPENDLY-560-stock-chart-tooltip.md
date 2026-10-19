# SPENDLY-560: Exact price tooltip on the stock chart

Bug under epic SPENDLY-531, related to SPENDLY-558. Branch: `feature/SPENDLY-560-stock-chart-tooltip`, cut from the epic branch (`cce2321`, which includes SPENDLY-559).

It reuses SPENDLY-558's normalized OHLCV contract (`StockHistoryDTO.candles`) and chart geometry. It changes no market-data sourcing or caching, makes no extra requests, does no Firestore reads, and leaves calculations and layouts outside the chart alone.

## What was wrong
- **Web:** hovering the chart did nothing. There were no pointer handlers, only a touch scrub.
- **Touch:** the scrub readout disappeared as soon as the finger lifted.
- **No tooltip:** values only ever showed in the header readout, never near the point.
- **Wrong time on merged points:** a merged line vertex was labelled with its bucket's *first* bar time but drawn at the bucket's *last* close, so the shown date didn't belong to the shown price.
- **Keyboard:** there was no keyboard access.

## Behaviour now
| Input | Select | Update | End |
|---|---|---|---|
| Mouse / pen (web) | Hover, or click | Follows the pointer | Pointer leaves the plot |
| Touch | Tap, or drag to scrub | Drag, or tap another point | Close button (×), a range or chart-type change. The selection stays after the finger lifts. |
| Keyboard (web) | Focus the plot, then ← → (Home/End) | Arrow keys | Escape, a range or chart-type change |

- Every selection snaps to the nearest bar that has a value. Bars with missing or non-finite prices are skipped, so the chart never shows NaN or undefined.
- **Line tooltip:** the exact close, plus the date and time of the raw bar that close came from. That still holds when bars are merged for width.
- **Candle tooltip:**
  - The genuine Open, High, Low and Close, with the close in green or red, plus volume when the feed has it.
  - A merged candle shows the time span it covers, for example "4 Jun 2027 – 6 Jun 2027".
- **Formatting:**
  - Times are in exchange time from the series' own `gmtOffsetSec` (IST for NSE/BSE), in the range's format.
  - Prices show 2 to 4 decimals, as the source carries them, with float noise removed. They are masked in ghost mode.
- **Placement:** the tooltip sits beside the marker, on the right, or on the left near the right edge. It is vertically centred on the point and clamped inside the plot, so it is never clipped. The marker is a ringed dot on a dashed vertical guide.
- **Stale selections:**
  - Each selection is tied to a series key: symbol, range, mode, the drawn bars and `asOf`.
  - A range change, chart-type change, width reflow or data refresh never shows the old values.
- **Accessibility:**
  - A keyboard selection is announced politely. Hover isn't announced, because it would flood a screen reader.
  - The tooltip carries a one-sentence label, and the plot has a keyboard hint on web.
- **Header readout:** it now always shows the range change and the as-of line, because the point values moved into the tooltip.
- **Mouse noise around taps:** a mouse hover or leave never moves or clears a touch selection. Browsers and hybrid devices fire mouse pointer events around a tap; QA caught this, see below.

## Code
- `shared/utils/stockChartInspect.ts` (new, pure) holds:
  - nearest and step selection;
  - exact-value lookup that knows about aggregation;
  - price, volume and time formatting;
  - tooltip placement;
  - the selection reducer and series key.
- `components/portfolio/stockChart/StockChartPlot.tsx`:
  - pointer hover and leave, with the pointer type recorded on pointer-down;
  - persistent touch;
  - web keyboard handling;
  - plot-local x measured from the host box on web, because RN-web's `locationX` is relative to whichever SVG node was hit;
  - the tooltip slot and its placement.
- `components/portfolio/stockChart/StockChartCard.tsx`:
  - the selection reducer and exact-value lookup;
  - the `ChartTooltip` component;
  - the header readout returns to the summary.

## Tests and QA
- **`shared/utils/stockChartInspect.test.ts`: 35 tests.** They cover:
  - nearest-point selection, including gaps and malformed or non-finite data;
  - keyboard stepping;
  - exact values for line points (merged and unmerged) and candles (single and merged);
  - formatting and tooltip placement at every edge;
  - pointer enter/move/leave and touch persistence/replace/dismiss;
  - a mouse leave around a touch, mouse click behaviour, and range/mode/refresh rebinding.
- **Full suite:** `npm test` passed 377 files and 5,681 tests. `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` both passed.
- **Web QA setup:**
  - Playwright against `expo start --web` on the emulator, opened at `http://127.0.0.1:8091`, because the SPENDLY-175 local-test network guard only allows the emulator host.
  - `/api/stock-history` was answered from a fixture in the real DTO shape, with a gap bar. No live market data was used, and the app code was unchanged.
- **Desktop (1440):**
  - Hover at 30% and 70% shows the exact values. At the right edge the tooltip flips left, still inside the plot.
  - Leaving clears the tooltip. The gap bar resolves to its neighbour.
  - A click keeps the selection until the pointer leaves.
  - Candles show OHLC and volume, all matching the fixture.
  - A range switch clears the selection.
  - Keyboard End, ← and Escape work.
  - ALL plus candles (900 bars merged 3 at a time) shows the bucket span and genuine OHLC and summed volume, checked by hand.
- **Phone (390, touch):**
  - A tap keeps the tooltip after release. This passed 5 out of 5 after the mouse-leave fix; before the fix it failed about half the time.
  - A second tap replaces it, and × dismisses it.
- **Requests:** inspection made no history requests except the deliberate range switch, and no Firestore requests.
- **Not run:**
  - Native Android/iOS device QA. Native keeps the responder path, and pointer-type tagging defaults to touch.
  - The repo has no component test runner, which is why the interaction rules live in the tested reducer.

## Known limits
- Tapping on the tooltip itself, rather than the chart, doesn't move the selection, and the × is part of the tooltip. Tap the chart beside it instead.
- "Tap outside the chart to dismiss" isn't implemented. Touch selections end with the × button or a range or chart-type change, which the ticket allows as a visible close action.
