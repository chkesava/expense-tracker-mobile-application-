import { z } from "zod";

const dateKeyRegex = /^\d{4}-\d{2}-\d{2}$/;

export const exchangeSchema = z.enum(["NSE", "BSE", "US"]);
export const instrumentTypeSchema = z.enum(["stock", "etf", "mutual_fund", "gold", "crypto"]);
export const brokerSchema = z.enum(["Groww", "Zerodha", "Upstox", "Angel One", "Other"]);
export const transactionTypeSchema = z.enum(["BUY", "SELL", "BONUS", "SPLIT", "DIVIDEND"]);
export const alertConditionSchema = z.enum(["price_above", "price_below", "profit_above", "loss_above"]);

export const onboardingStep1Schema = z.object({
  initialInvestmentAmount: z.number().min(0, "Amount must be 0 or more"),
});

export const addHoldingSchema = z
  .object({
    exchange: exchangeSchema,
    instrumentType: z.enum(["stock", "etf", "mutual_fund", "crypto"]),
    symbol: z.string().min(1, "Symbol / scheme code / coin id is required"),
    yahooSymbol: z.string().min(1),
    name: z.string().min(1, "Name is required"),
    quantity: z.number().positive("Quantity must be greater than 0"),
    averageBuyPrice: z.number().positive("Average price must be greater than 0"),
    targetPrice: z.number().positive("Target price must be greater than 0").optional(),
    broker: brokerSchema.optional(),
    datePurchased: z.string().regex(dateKeyRegex, "Invalid date").optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.instrumentType === "mutual_fund" && !/^\d+$/.test(data.symbol.trim())) {
      ctx.addIssue({
        code: "custom",
        path: ["symbol"],
        message: "Enter a valid numeric scheme code",
      });
    }
    if (data.instrumentType === "crypto" && !data.symbol.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["symbol"],
        message: "Select a crypto coin",
      });
    }
  });

export const mockBuySchema = z.object({
  orderType: z.enum(["MARKET", "LIMIT"]),
  quantity: z.number().positive("Quantity must be greater than 0"),
  price: z.number().positive("Price must be greater than 0"),
  targetPrice: z.number().positive("Target price must be greater than 0").optional(),
  broker: brokerSchema.optional(),
  date: z.string().regex(dateKeyRegex, "Invalid date"),
  fees: z.number().min(0, "Fees cannot be negative"),
  notes: z.string().max(500).optional(),
});

export const mockSellSchema = z.object({
  quantity: z.number().positive("Quantity must be greater than 0"),
  price: z.number().positive("Price must be greater than 0"),
  broker: brokerSchema.optional(),
  date: z.string().regex(dateKeyRegex, "Invalid date"),
  fees: z.number().min(0, "Fees cannot be negative"),
  notes: z.string().max(500).optional(),
});

export const watchlistSchema = z.object({
  symbol: z.string().min(1),
  yahooSymbol: z.string().min(1),
  name: z.string().min(1),
  exchange: exchangeSchema,
  instrumentType: instrumentTypeSchema,
});

export const alertSchema = z.object({
  symbol: z.string().min(1),
  yahooSymbol: z.string().min(1),
  name: z.string().min(1),
  condition: alertConditionSchema,
  threshold: z.number().positive("Threshold must be greater than 0"),
});

export type OnboardingStep1Input = z.infer<typeof onboardingStep1Schema>;
export type AddHoldingInput = z.infer<typeof addHoldingSchema>;
export type MockBuyInput = z.infer<typeof mockBuySchema>;
export type MockSellInput = z.infer<typeof mockSellSchema>;
export type WatchlistInput = z.infer<typeof watchlistSchema>;
export type AlertInput = z.infer<typeof alertSchema>;
