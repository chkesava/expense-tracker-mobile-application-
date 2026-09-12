import { z } from "zod";

import { normalizeUan } from "@/shared/features/epf/utils";

const dateKeyRegex = /^\d{4}-\d{2}-\d{2}$/;

/**
 * UAN: exactly 12 digits.
 *
 * Strict on shape, lenient on input — separators are stripped by
 * `normalizeUan` before validation, so "1001 2345 6789" and "1001-2345-6789"
 * both pass. No check-digit validation: UAN's checksum is not published as a
 * stable contract, and a wrong implementation would lock out valid users.
 */
export const uanSchema = z
  .string()
  .transform((value) => normalizeUan(value))
  .refine((value) => /^\d{12}$/.test(value), {
    message: "UAN must be exactly 12 digits",
  });

export const epfEmploymentStatusSchema = z.enum(["current", "previous"]);

export const epfProfileFormSchema = z.object({
  employeeName: z
    .string()
    .trim()
    .min(1, "Employee name is required")
    .max(80, "Employee name is too long"),
  uan: uanSchema,
  notes: z.string().trim().max(500, "Notes are too long").optional().or(z.literal("")),
});

export const epfEstablishmentFormSchema = z
  .object({
    employerName: z
      .string()
      .trim()
      .min(1, "Employer name is required")
      .max(120, "Employer name is too long"),
    establishmentNumber: z
      .string()
      .trim()
      .min(1, "Establishment number is required")
      .max(30, "Establishment number is too long"),
    memberId: z
      .string()
      .trim()
      .min(1, "PF member ID is required")
      .max(40, "PF member ID is too long"),
    dateJoined: z.string().regex(dateKeyRegex, "Invalid joining date"),
    dateLeft: z
      .string()
      .regex(dateKeyRegex, "Invalid leaving date")
      .optional()
      .or(z.literal("")),
    notes: z.string().trim().max(500, "Notes are too long").optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    // Lexicographic comparison is safe on YYYY-MM-DD keys, and is what
    // sipPlanFormSchema already does for endDate < startDate.
    if (data.dateLeft && data.dateLeft < data.dateJoined) {
      ctx.addIssue({
        code: "custom",
        path: ["dateLeft"],
        message: "Leaving date must be on or after the joining date",
      });
    }
  });

export type EpfProfileFormInput = z.infer<typeof epfProfileFormSchema>;
export type EpfEstablishmentFormInput = z.infer<typeof epfEstablishmentFormSchema>;

/* ---------------------------------------------------------------------------
 * Contributions — KAN-66
 * ------------------------------------------------------------------------ */

const monthKeyRegex = /^\d{4}-(0[1-9]|1[0-2])$/;

export const monthKeySchema = z.string().regex(monthKeyRegex, "Invalid month");

/** Monthly EPF wage (basic + DA). Rupees, not paise — see the KAN-65 money decision. */
export const epfWageSchema = z.coerce
  .number({ message: "Enter a valid amount" })
  .refine(Number.isFinite, "Enter a valid amount")
  .nonnegative("Wage cannot be negative")
  .max(10_000_000, "Wage is too large");

const nonNegativeAmount = z.coerce
  .number({ message: "Enter a valid amount" })
  .refine(Number.isFinite, "Enter a valid amount")
  .nonnegative("Amounts cannot be negative");

export const epfBackfillSetupSchema = z
  .object({
    monthlyWage: epfWageSchema,
    epsEligible: z.boolean(),
    startMonth: monthKeySchema,
    endMonth: monthKeySchema,
    prorateEdgeMonths: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.endMonth < data.startMonth) {
      ctx.addIssue({
        code: "custom",
        path: ["endMonth"],
        message: "End month must be on or after the start month",
      });
    }
  });

/**
 * One month's editable values.
 *
 * The month-inside-employment-period rule is deliberately NOT here — it needs
 * the establishment as context, so it lives in `validateEpfContribution`,
 * exactly as establishment overlap lives in utils rather than in
 * `epfEstablishmentFormSchema`.
 */
export const epfContributionRowFormSchema = z
  .object({
    month: monthKeySchema,
    wage: epfWageSchema.optional(),
    employeeShare: nonNegativeAmount,
    employerShare: nonNegativeAmount,
    epsShare: nonNegativeAmount,
    employerEpfShare: nonNegativeAmount,
    creditDate: z
      .string()
      .regex(dateKeyRegex, "Invalid credit date")
      .optional()
      .or(z.literal("")),
    reference: z.string().trim().max(60, "Reference is too long").optional().or(z.literal("")),
    notes: z.string().trim().max(500, "Notes are too long").optional().or(z.literal("")),
    zeroReason: z
      .string()
      .trim()
      .max(120, "Reason is too long")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.epsShare > data.employerShare) {
      ctx.addIssue({
        code: "custom",
        path: ["epsShare"],
        message: "Pension share cannot exceed the employer contribution",
      });
    }

    // Tolerance of ₹1 absorbs whole-rupee rounding of the statutory shares.
    if (Math.abs(data.employerEpfShare - (data.employerShare - data.epsShare)) > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["employerEpfShare"],
        message: "Employer EPF share should equal employer contribution minus pension",
      });
    }

    const allZero =
      data.employeeShare === 0 && data.employerShare === 0 && data.epsShare === 0;
    if (allZero && !data.zeroReason) {
      ctx.addIssue({
        code: "custom",
        path: ["zeroReason"],
        message: "Add a reason for a zero-contribution month",
      });
    }
  });

export type EpfBackfillSetupInput = z.infer<typeof epfBackfillSetupSchema>;
export type EpfContributionRowFormInput = z.infer<typeof epfContributionRowFormSchema>;

/**
 * Recording what actually landed for a month — KAN-68.
 *
 * The credit date cannot precede the contribution month: money for August
 * cannot arrive in July.
 */
export const epfCreditFormSchema = z
  .object({
    month: monthKeySchema,
    amount: nonNegativeAmount,
    date: z.string().regex(dateKeyRegex, "Invalid credit date"),
  })
  .superRefine((data, ctx) => {
    if (data.date < `${data.month}-01`) {
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: "Credit date cannot precede the contribution month",
      });
    }
  });

export type EpfCreditFormInput = z.infer<typeof epfCreditFormSchema>;

/* ---------------------------------------------------------------------------
 * Transfers — KAN-69
 * ------------------------------------------------------------------------ */

/**
 * Shape-level validation for the transfer form.
 *
 * Balance and establishment-ownership rules need context the schema does not
 * have, so they live in `validateTransfer` — the same split KAN-65 used for
 * employment overlap and KAN-66 used for month-in-period.
 */
export const epfTransferFormSchema = z
  .object({
    sourceEstablishmentId: z.string().min(1, "Pick the employer to transfer from"),
    destinationEstablishmentId: z.string().min(1, "Pick the employer to transfer to"),
    amount: z.coerce
      .number({ message: "Enter a valid amount" })
      .refine(Number.isFinite, "Enter a valid amount")
      .positive("Transfer amount must be greater than zero")
      .max(100_000_000, "Amount is too large"),
    date: z.string().regex(dateKeyRegex, "Invalid transfer date"),
    reference: z.string().trim().max(60, "Reference is too long").optional().or(z.literal("")),
    notes: z.string().trim().max(500, "Notes are too long").optional().or(z.literal("")),
    adjustmentReason: z
      .string()
      .trim()
      .max(200, "Reason is too long")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.sourceEstablishmentId === data.destinationEstablishmentId) {
      ctx.addIssue({
        code: "custom",
        path: ["destinationEstablishmentId"],
        message: "Source and destination must be different employers",
      });
    }
  });

export type EpfTransferFormInput = z.infer<typeof epfTransferFormSchema>;

/* ---------------------------------------------------------------------------
 * Reconciliation — KAN-70
 * ------------------------------------------------------------------------ */

/**
 * Recording the balance EPFO actually shows.
 *
 * Establishment ownership and the not-in-the-future rule need context the
 * schema does not have, so they live in `validateReconciliation` — the same
 * split used since KAN-65.
 */
export const epfReconciliationFormSchema = z.object({
  actualBalance: z.coerce
    .number({ message: "Enter a valid amount" })
    .refine(Number.isFinite, "Enter a valid amount")
    .nonnegative("Balance cannot be negative")
    .max(100_000_000, "Amount is too large"),
  date: z.string().regex(dateKeyRegex, "Invalid date"),
  reference: z.string().trim().max(60, "Reference is too long").optional().or(z.literal("")),
  notes: z.string().trim().max(500, "Notes are too long").optional().or(z.literal("")),
});

export type EpfReconciliationFormInput = z.infer<typeof epfReconciliationFormSchema>;
