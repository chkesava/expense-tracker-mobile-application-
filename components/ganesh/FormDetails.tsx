import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";

/**
 * Progressive disclosure for Ganesh add-* forms.
 *
 * Required fields stay on the first screen. Optional fields (notes, photos,
 * vendor, extra asset metadata) sit behind this toggle so recording a
 * collection or a 6am aarti does not ask for six unused inputs.
 */
export function FormDetails({
  children,
  label = "Add details",
}: {
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (open) return <>{children}</>;
  return (
    <Button variant="ghost" onPress={() => setOpen(true)}>
      {label}
    </Button>
  );
}
