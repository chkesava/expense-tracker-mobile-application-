export interface UserStats {
    currentStreak: number; // Keeping for legacy/total streak if needed, or mapped to shields
    longestStreak: number;
    lastLoginDate: string; // ISO date string YYYY-MM-DD
    points: number;
    level: number;
    badges: string[];

    // New fields for Shields vs Fire
    shields: number; // Current no-spend streak
    fires: number;   // Current spend streak
    focusStreak: number; // Days of successful focus mode
    focusWins: number;   // Total successful focus days
    monthlyRecords: {
        [key: string]: { // "YYYY-MM"
            maxShields: number;
            maxFires: number;
            totalShields: number;
            totalFires: number;
        }
    };
}

export const LEVEL_THRESHOLDS = {
    1: 0,
    2: 100,
    3: 300,
    4: 600,
    5: 1000,
    6: 2000,
    7: 3500,
    8: 5000,
    9: 7500,
    10: 10000,
};

export const BADGES = {
    NO_SPEND: { id: 'no_spend', icon: '🛡️', name: 'No Spend Day' },
    STREAK_7: { id: 'streak_7', icon: '🔥', name: '7 Day Streak' },
    SAVER_PRO: { id: 'saver_pro', icon: '💰', name: 'Saver Pro' },
};
