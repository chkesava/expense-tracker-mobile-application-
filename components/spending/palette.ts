/**
 * Spending Overview slice colours: the theme accent first, then the data-viz
 * tail `categoryRamp` uses. Shared by the dashboard donut and the SPENDLY-574
 * drill-downs so a category keeps its colour from the dashboard into the
 * detail pages for the same month (both rank categories by amount).
 */
export function spendingSliceColor(
  index: number,
  label: string,
  colors: { primary: string; info: string },
  othersLabel = "Others"
): string {
  if (label === othersLabel) return colors.info;
  const ramp = [colors.primary, "#EC4899", "#8B5CF6", "#F59E0B", "#0EA5E9"];
  return ramp[index % ramp.length];
}
