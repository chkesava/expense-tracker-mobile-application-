/**
 * SPENDLY-313 — India-first fee & charge taxonomy.
 *
 * Type and subtype ids are persisted on `feeReviews` documents, so they are
 * append-only: add new ids, never rename or remove one. Labels may change.
 *
 * `categoryKeys` links each type to the subcategory keys of
 * `CATEGORY_TAXONOMY` (shared/data/categoryTaxonomy.ts) that a user would
 * normally file such a charge under. It is a hint for detection and for
 * suggesting a category — the category on the expense itself is never changed.
 */

import { FEE_TYPE_IDS, type FeeTypeId } from "../types/fee";

export interface FeeSubtypeDef {
  id: string;
  label: string;
}

export interface FeeTypeDef {
  id: FeeTypeId;
  label: string;
  description: string;
  subtypes: FeeSubtypeDef[];
  categoryKeys: string[];
}

function st(id: string, label: string): FeeSubtypeDef {
  return { id, label };
}

export const FEE_TAXONOMY: readonly FeeTypeDef[] = [
  {
    id: "atm_cash",
    label: "ATM / cash withdrawal",
    description: "Charges for ATM use beyond the free limit, other-bank ATMs or declined withdrawals.",
    subtypes: [
      st("excess_withdrawal", "Beyond free withdrawals"),
      st("other_bank_atm", "Other bank's ATM"),
      st("declined_transaction", "Declined transaction"),
      st("balance_enquiry", "Balance enquiry"),
      st("cash_at_branch", "Cash at branch"),
    ],
    categoryKeys: ["atm_fees"],
  },
  {
    id: "bank_service",
    label: "Bank service charge",
    description: "Account upkeep and service fees levied by a bank.",
    subtypes: [
      st("account_maintenance", "Account maintenance"),
      st("sms_alerts", "SMS alerts"),
      st("statement_request", "Statement / certificate request"),
      st("locker", "Locker rent"),
      st("account_closure", "Account closure"),
      st("other_service", "Other service"),
    ],
    categoryKeys: ["bank_charges"],
  },
  {
    id: "min_balance",
    label: "Minimum balance",
    description: "Penalty for not keeping the required average or minimum balance.",
    subtypes: [
      st("average_balance_shortfall", "Average balance shortfall"),
      st("minimum_balance_shortfall", "Minimum balance shortfall"),
    ],
    categoryKeys: ["bank_charges"],
  },
  {
    id: "debit_card",
    label: "Debit card",
    description: "Issuance, annual and replacement charges on debit cards.",
    subtypes: [
      st("annual_fee", "Annual fee"),
      st("issuance", "Issuance"),
      st("replacement", "Replacement"),
    ],
    categoryKeys: ["bank_charges"],
  },
  {
    id: "credit_card",
    label: "Credit card",
    description: "Joining, annual and usage charges on a credit card.",
    subtypes: [
      st("joining_fee", "Joining fee"),
      st("annual_fee", "Annual / renewal fee"),
      st("add_on_card", "Add-on card"),
      st("fuel_surcharge", "Fuel surcharge"),
      st("over_limit", "Over-limit"),
      st("reward_redemption", "Reward redemption"),
      st("rent_or_wallet_surcharge", "Rent / wallet / utility surcharge"),
      st("replacement", "Card replacement"),
    ],
    categoryKeys: ["credit_card_fees"],
  },
  {
    id: "late_payment",
    label: "Late payment",
    description: "Charged when a due amount is paid after the due date.",
    subtypes: [
      st("credit_card", "Credit card"),
      st("loan_emi", "Loan EMI"),
      st("bill", "Bill"),
    ],
    categoryKeys: ["credit_card_fees", "loan_fees", "fines_penalties"],
  },
  {
    id: "cash_advance",
    label: "Cash advance",
    description: "Fee for withdrawing cash on a credit card.",
    subtypes: [st("credit_card_cash", "Credit card cash withdrawal")],
    categoryKeys: ["credit_card_fees"],
  },
  {
    id: "emi_conversion",
    label: "EMI conversion",
    description: "Processing and pre-closure fees when a purchase is turned into EMIs.",
    subtypes: [
      st("processing_fee", "Processing fee"),
      st("pre_closure", "Pre-closure"),
    ],
    categoryKeys: ["credit_card_fees", "loan_fees"],
  },
  {
    id: "forex",
    label: "Forex / foreign currency",
    description: "Markup on foreign-currency or cross-border transactions.",
    subtypes: [
      st("markup", "Currency markup"),
      st("cross_border", "Cross-border (INR) fee"),
      st("dynamic_conversion", "Dynamic currency conversion"),
    ],
    categoryKeys: ["credit_card_fees", "bank_charges"],
  },
  {
    id: "payment_upi",
    label: "UPI / payment",
    description: "Convenience, gateway and wallet charges on a payment.",
    subtypes: [
      st("convenience_fee", "Convenience fee"),
      st("payment_gateway", "Payment gateway"),
      st("wallet_load", "Wallet top-up"),
      st("upi", "UPI"),
    ],
    categoryKeys: ["financial_service_fees", "bank_charges"],
  },
  {
    id: "cheque",
    label: "Cheque",
    description: "Cheque book, bounce and stop-payment charges.",
    subtypes: [
      st("bounce", "Cheque bounce / return"),
      st("stop_payment", "Stop payment"),
      st("cheque_book", "Cheque book"),
    ],
    categoryKeys: ["bank_charges"],
  },
  {
    id: "transfer_remittance",
    label: "Transfer / remittance",
    description: "Charges on NEFT, RTGS, IMPS and international remittances.",
    subtypes: [
      st("domestic_transfer", "NEFT / RTGS / IMPS"),
      st("international_remittance", "International remittance"),
      st("demand_draft", "Demand draft"),
    ],
    categoryKeys: ["bank_charges"],
  },
  {
    id: "investment",
    label: "Investment / brokerage",
    description: "Brokerage, depository and account charges on investments.",
    subtypes: [
      st("brokerage", "Brokerage"),
      st("depository", "Depository (DP) charges"),
      st("demat_maintenance", "Demat maintenance"),
      st("exit_load", "Exit load"),
      st("platform_fee", "Platform / advisory fee"),
    ],
    categoryKeys: ["investment_fees"],
  },
  {
    id: "loan",
    label: "Loan charges",
    description: "Processing, prepayment, foreclosure and penal charges on a loan.",
    subtypes: [
      st("processing_fee", "Processing fee"),
      st("prepayment", "Prepayment"),
      st("foreclosure", "Foreclosure"),
      st("penal_charge", "Penal charge"),
      st("documentation", "Documentation"),
      st("bounce", "EMI bounce"),
    ],
    categoryKeys: ["loan_fees"],
  },
  {
    id: "other",
    label: "Other charge",
    description: "A fee that fits none of the other families.",
    subtypes: [],
    categoryKeys: ["financial_service_fees", "bank_charges"],
  },
];

const BY_ID = new Map<FeeTypeId, FeeTypeDef>(
  FEE_TAXONOMY.map((def) => [def.id, def])
);

export function feeTypeDef(id: FeeTypeId): FeeTypeDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown fee type: ${id}`);
  return def;
}

export function isFeeTypeId(value: unknown): value is FeeTypeId {
  return (
    typeof value === "string" &&
    (FEE_TYPE_IDS as readonly string[]).includes(value)
  );
}

/** True when `subtype` belongs to `type`. An absent subtype is always valid. */
export function isValidFeeSubtype(type: FeeTypeId, subtype?: string): boolean {
  if (subtype === undefined || subtype === "") return true;
  return feeTypeDef(type).subtypes.some((s) => s.id === subtype);
}

export function feeTypeLabel(id: FeeTypeId): string {
  return feeTypeDef(id).label;
}

export function feeSubtypeLabel(type: FeeTypeId, subtype?: string): string | undefined {
  if (!subtype) return undefined;
  return feeTypeDef(type).subtypes.find((s) => s.id === subtype)?.label;
}
