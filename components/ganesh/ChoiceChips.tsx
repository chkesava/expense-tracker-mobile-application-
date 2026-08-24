import { FilterChips } from "@/components/ganesh/ui/FilterChips";

/**
 * Kept for call-site compatibility — the implementation now lives in
 * `components/ganesh/ui/FilterChips`, which is the single chip control for
 * Ganesh Seva.
 */
export function ChoiceChips<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  disabledIds,
}: {
  label?: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  disabledIds?: T[];
}) {
  return (
    <FilterChips
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      disabled={disabled}
      disabledIds={disabledIds}
      layout="wrap"
    />
  );
}
