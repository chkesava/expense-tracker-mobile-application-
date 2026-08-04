export interface Subscription {
    id?: string;
    name: string;
    amount: number;
    category: string;
    dayOfMonth: number; // 1-31
    isActive: boolean;
    lastProcessed: string; // "YYYY-MM"
    type: "subscription" | "emi" | "transfer";
    endMonth?: number; // 1-12
    endYear?: number;
    isCompleted?: boolean;
    accountId?: string;
    /** Destination account for a recurring internal transfer. */
    toAccountId?: string;
    createdAt?: any;
}
