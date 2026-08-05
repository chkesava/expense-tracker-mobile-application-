import { useFinanceDataContext } from "@/providers/FinanceDataProvider";

export function useFinanceData() {
  return useFinanceDataContext();
}
