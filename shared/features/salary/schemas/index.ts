import { z } from "zod";

import {
  SALARY_CONFIDENCES,
  SALARY_PROVENANCE_SOURCES,
  SALARY_REJECTION_REASONS,
  SALARY_REVIEW_DECISIONS,
  SALARY_STATUSES,
  SALARY_TYPES,
} from "../types";

const dateKeyRegex = /^\d{4}-\d{2}-\d{2}$/;
const monthKeyRegex = /^\d{4}-\d{2}$/;

export const salaryPayPeriodSchema = z.object({
  month: z.string().regex(monthKeyRegex, "Month must be in YYYY-MM format"),
  startDate: z.string().regex(dateKeyRegex).optional(),
  endDate: z.string().regex(dateKeyRegex).optional(),
});

export const salaryEmployerSchema = z.object({
  name: z.string().trim().min(1, "Employer name is required").max(120),
  rawName: z.string().trim().max(160).optional(),
  normalizedName: z.string().trim().max(120).optional(),
  epfEstablishmentId: z.string().max(80).optional(),
  uanOrMemberId: z.string().max(40).optional(),
});

export const salaryDeductionsSchema = z.object({
  tds: z.number().nonnegative().optional(),
  epf: z.number().nonnegative().optional(),
  professionalTax: z.number().nonnegative().optional(),
  other: z.number().nonnegative().optional(),
  notes: z.string().max(300).optional(),
});

export const salaryAllowancesSchema = z.object({
  basic: z.number().nonnegative().optional(),
  hra: z.number().nonnegative().optional(),
  special: z.number().nonnegative().optional(),
  other: z.number().nonnegative().optional(),
});

export const salaryComponentBreakdownSchema = z.object({
  grossSalary: z.number().nonnegative().optional(),
  allowances: salaryAllowancesSchema.optional(),
  deductions: salaryDeductionsSchema.optional(),
  variablePay: z.number().nonnegative().optional(),
  netSalary: z.number().positive("Net salary must be positive"),
  reconciled: z.boolean().optional(),
});

export const salaryProvenanceSchema = z.object({
  source: z.enum(SALARY_PROVENANCE_SOURCES),
  detectionRule: z.string().max(80).optional(),
  reviewedAtMs: z.number().int().positive().optional(),
  originalValues: z
    .object({
      netAmount: z.number().optional(),
      month: z.string().regex(monthKeyRegex).optional(),
      employerName: z.string().optional(),
      salaryType: z.enum(SALARY_TYPES).optional(),
    })
    .optional(),
});

export const salaryRecordSchema = z.object({
  id: z.string().min(1),
  uid: z.string().optional(),
  month: z.string().regex(monthKeyRegex, "Month must be in YYYY-MM format"),
  payPeriod: salaryPayPeriodSchema,
  employer: salaryEmployerSchema,
  netAmount: z.number().positive("Net amount must be greater than zero"),
  grossAmount: z.number().positive().nullable().optional(),
  currency: z.string().length(3).default("INR"),
  paymentDate: z.string().regex(dateKeyRegex, "Payment date must be YYYY-MM-DD"),
  transactionId: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  type: z.enum(SALARY_TYPES),
  status: z.enum(SALARY_STATUSES),
  confidence: z.enum(SALARY_CONFIDENCES).optional(),
  evidence: z.array(z.string().max(200)).max(10).optional(),
  breakdown: salaryComponentBreakdownSchema.optional(),
  provenance: salaryProvenanceSchema,
  notes: z.string().max(500).optional(),
  createdAtMs: z.number().int().positive(),
  updatedAtMs: z.number().int().positive(),
  deletedAt: z.string().regex(dateKeyRegex).optional(),
});

export const salaryProfileSchema = z.object({
  id: z.string().min(1),
  uid: z.string().optional(),
  primaryEmployer: z.string().trim().min(1).max(120),
  expectedPaydayWindow: z.object({
    startDay: z.number().int().min(1).max(31),
    endDay: z.number().int().min(1).max(31),
  }),
  frequency: z.literal("monthly"),
  primaryAccountId: z.string().optional(),
  notificationEnabled: z.boolean(),
  notes: z.string().max(500).optional(),
  createdAtMs: z.number().int().positive(),
  updatedAtMs: z.number().int().positive(),
});

export const salaryReviewSchema = z.object({
  id: z.string().min(1),
  uid: z.string().optional(),
  refKey: z.string().startsWith("income:"),
  decision: z.enum(SALARY_REVIEW_DECISIONS),
  salaryType: z.enum(SALARY_TYPES).optional(),
  correctedEmployerName: z.string().trim().max(120).optional(),
  correctedPayPeriodMonth: z.string().regex(monthKeyRegex).optional(),
  rejectionReason: z.enum(SALARY_REJECTION_REASONS).optional(),
  sourceAmount: z.number().positive(),
  sourceDate: z.string().regex(dateKeyRegex),
  createdAtMs: z.number().int().positive(),
  updatedAtMs: z.number().int().positive(),
});
