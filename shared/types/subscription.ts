export type SubscriptionFrequency = "monthly" | "every_n_days";

export interface Subscription {
    id?: string;
    name: string;
    amount: number;
    category: string;
    dayOfMonth: number; // 1-31; used when frequency is monthly
    /** Missing on older docs — treat as monthly. */
    frequency?: SubscriptionFrequency;
    /** Required when frequency is `every_n_days` (e.g. chicken every 2 days). */
    intervalDays?: number;
    isActive: boolean;
    lastProcessed: string; // "YYYY-MM" for monthly cadence
    /** "YYYY-MM-DD" — used by every-N-days auto-post / next-due. */
    lastProcessedDate?: string;
    type: "subscription" | "emi" | "transfer";
    /** `sms` = detected from repeating expenses; skip auto-post to avoid double-counting. */
    source?: "manual" | "sms";
    /**
     * "YYYY-MM" — first month this may auto-post. Missing on older docs, which
     * keeps their existing behaviour (due from whenever they were created).
     * Set when the first debit is only meant to happen in a later month, e.g. an
     * EMI added on the 5th whose billing day (the 3rd) has already passed.
     */
    startMonth?: string;
    endMonth?: number; // 1-12
    endYear?: number;
    isCompleted?: boolean;
    accountId?: string;
    /** Destination account for a recurring internal transfer. */
    toAccountId?: string;
    createdAt?: any;
}

export function subscriptionFrequency(
    sub: Pick<Subscription, "frequency">
): SubscriptionFrequency {
    return sub.frequency === "every_n_days" ? "every_n_days" : "monthly";
}
