import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { gridColumnsOf } from "@/shared/utils/responsiveLayout";

type GridItemProps = {
  children: ReactNode;
  /** `full` takes the whole row; otherwise one column. */
  span?: 1 | "full";
};

/** One cell of a `ResponsiveGrid`. Layout comes from the grid. */
export function GridItem({ children }: GridItemProps) {
  return <View>{children}</View>;
}

/**
 * Card grid for Spendly screens (SPENDLY-559): one column on phones and
 * native, two on tablet web, three on desktop web.
 *
 * On one column it renders a plain stacked View with the same gap, so the
 * phone layout is identical to a `{ gap }` column. Above that it is a
 * masonry: `span="full"` items keep a row of their own, and each run of
 * items between them is dealt round-robin into equal columns, so cards of
 * different heights never leave holes. A widget that renders nothing only
 * costs one gap. Columns are flex children, so a resize reflows at once.
 */
export function ResponsiveGrid({
  children,
  gap = 12,
  maxColumns = 3,
  style,
}: {
  children: ReactNode;
  gap?: number;
  maxColumns?: 1 | 2 | 3;
  style?: StyleProp<ViewStyle>;
}) {
  const { layout } = useResponsiveLayout();
  const columns = gridColumnsOf(layout, maxColumns);

  if (columns === 1) {
    return <View style={[{ gap }, style]}>{children}</View>;
  }

  // Split into full-width rows and runs of one-column items.
  const segments: (ReactElement | ReactElement[])[] = [];
  let run: ReactElement[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement<GridItemProps>(child)) continue;
    if (child.props.span === "full") {
      if (run.length) segments.push(run);
      run = [];
      segments.push(child);
    } else {
      run.push(child);
    }
  }
  if (run.length) segments.push(run);

  return (
    <View style={[{ gap }, style]}>
      {segments.map((segment, index) =>
        Array.isArray(segment) ? (
          <View key={`run-${index}`} style={{ flexDirection: "row", gap, alignItems: "flex-start" }}>
            {Array.from({ length: columns }, (_, column) => (
              <View key={column} style={{ flex: 1, minWidth: 0, gap }}>
                {segment.filter((_, i) => i % columns === column)}
              </View>
            ))}
          </View>
        ) : (
          segment
        )
      )}
    </View>
  );
}
