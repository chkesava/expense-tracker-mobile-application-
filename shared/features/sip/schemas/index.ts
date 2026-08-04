import { z } from "zod";

const dateKeyRegex = /^\d{4}-\d{2}-\d{2}$/;

export const sipAssetTypeSchema = z.enum(["stock", "etf", "mutual_fund", "crypto"]);
export const sipFrequencySchema = z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]);
export const sipStatusSchema = z.enum(["active", "paused", "completed", "cancelled"]);

export const sipPlanFormSchema = z
  .object({
    assetType: sipAssetTypeSchema,
    symbol: z.string().min(1, "Symbol is required"),
    quoteKey: z.string().min(1),
    assetName: z.string().min(1, "Asset name is required"),
    investmentAmount: z.number().positive("Amount must be greater than 0"),
    currency: z.string().min(1).optional(),
    frequency: sipFrequencySchema,
    executionDay: z.number().int().min(0).max(31),
    startDate: z.string().regex(dateKeyRegex, "Invalid start date"),
    endDate: z.string().regex(dateKeyRegex, "Invalid end date").optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.frequency === "weekly" && (data.executionDay < 0 || data.executionDay > 6)) {
      ctx.addIssue({
        code: "custom",
        path: ["executionDay"],
        message: "Pick a weekday (Sunday–Saturday)",
      });
    }
    if (
      (data.frequency === "monthly" ||
        data.frequency === "quarterly" ||
        data.frequency === "yearly") &&
      !(
        (data.executionDay >= 1 && data.executionDay <= 28) ||
        data.executionDay === 31
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["executionDay"],
        message: "Pick day 1–28 or Last day of month",
      });
    }
    if (data.endDate && data.endDate < data.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "End date must be on or after start date",
      });
    }
  });

export type SipPlanFormInput = z.infer<typeof sipPlanFormSchema>;
