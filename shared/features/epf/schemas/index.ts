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
