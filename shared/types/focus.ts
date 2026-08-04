export type FocusStatus = 'active' | 'completed' | 'failed' | 'abandoned';

export interface FocusSession {
    id: string;
    category: string;
    dailyLimit: number;
    startDate: string; // ISO Date String
    durationDays: number;
    endDate: string; // ISO Date String
    status: FocusStatus;

    // Progress tracking
    currentSpend: number; // Spend for TODAY (should be calculated dynamically, but maybe cached here?) 
    // Actually, dynamic calculation is better to avoid sync issues. 
    // But we might want to store "days succeeded" count.
    daysSuccessful: number;
    lastCheckDate: string; // To know when we last updated 'daysSuccessful'
}

export const FOCUS_DURATIONS = [3, 7, 30]; 
