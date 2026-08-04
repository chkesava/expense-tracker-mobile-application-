export type UserRole = "USER" | "SUPER_ADMIN";

export interface UserProfile {
    uid: string;
    email: string | null;
    displayName: string | null;
    username?: string;
    photoURL: string | null;
    role: UserRole;
    createdAt: any; // Firebase Timestamp
    lastLoginAt?: any; // Firebase Timestamp
}
