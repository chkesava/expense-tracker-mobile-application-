/**
 * Spending Overview slice colours: the theme accent first, then the data-viz
 * tail `categoryRamp` uses. Shared by the dashboard donut and the SPENDLY-574
 * drill-downs so a category keeps its colour from the dashboard into the
 * detail pages for the same month (both rank categories by amount).
 * SPENDLY-677: a theme with its own slice ramp (the light Expense palettes)
 * uses that instead.
 */
export function spendingSliceColor(
  index: number,
  label: string,
  theme: { colors: { primary: string; info: string }; chart: { slices?: string[] } },
  othersLabel = "Others"
): string {
  if (label === othersLabel) return theme.colors.info;
  const ramp = theme.chart.slices?.length
    ? theme.chart.slices
    : [theme.colors.primary, "#EC4899", "#8B5CF6", "#F59E0B", "#0EA5E9"];
  return ramp[index % ramp.length];
}
