import { FilterChips } from "@/components/ganesh/ui/FilterChips";
import type { PermanentFundLocation } from "@/shared/types/ganesh";

const LOCATIONS: PermanentFundLocation[] = ["cash", "upi", "bank", "other"];

export function fundLocationLabel(location: PermanentFundLocation): string {
  if (location === "upi") return "UPI";
  return location.charAt(0).toUpperCase() + location.slice(1);
}

export function FundLocationChips({
  value,
  onChange,
}: {
  value: PermanentFundLocation;
  onChange: (next: PermanentFundLocation) => void;
}) {
  return (
    <FilterChips
      value={value}
      onChange={onChange}
      layout="wrap"
      options={LOCATIONS.map((location) => ({
        id: location,
        label: fundLocationLabel(location),
      }))}
    />
  );
}
