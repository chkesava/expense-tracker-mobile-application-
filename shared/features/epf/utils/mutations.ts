import { isBalanceBearing, creditedSplit } from "./contributions";
import type { EpfContributionStatus, EpfContribution } from "../types";
import type { EpfSummaryDelta } from "../../../utils/epfMutations";

export function computeContributionDelta(
  existingRow: (Pick<EpfContribution, "employeeShare" | "employerEpfShare" | "epfCredit" | "creditedAmount"> & { status: EpfContributionStatus }) | null | undefined,
  newRow: (Pick<EpfContribution, "employeeShare" | "employerEpfShare" | "epfCredit" | "creditedAmount"> & { status: EpfContributionStatus }) | null
): EpfSummaryDelta {
  
  const wasBearing = existingRow && isBalanceBearing(existingRow.status);
  const isBearing = newRow && isBalanceBearing(newRow.status);

  let empOld = 0;
  let emrOld = 0;
  if (wasBearing && existingRow) {
    const split = creditedSplit(existingRow as any);
    empOld = split.employee;
    emrOld = split.employerEpf;
  }

  let empNew = 0;
  let emrNew = 0;
  if (isBearing && newRow) {
    const split = creditedSplit(newRow as any);
    empNew = split.employee;
    emrNew = split.employerEpf;
  }

  return {
    employeeContributionDelta: empNew - empOld,
    employerContributionDelta: emrNew - emrOld,
  };
}
