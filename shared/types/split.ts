export type SplitType = "equal" | "custom";

export interface Participant {
  name: string;
  amount: number;
  paid: boolean;
  upiId?: string;
  isCurrentUser: boolean;
  userId?: string;
  photoURL?: string;
}

export interface Split {
  id?: string;
  title: string;
  totalAmount: number;
  splitType: SplitType;
  participants: Participant[];
  createdBy: string;
  createdAt: number;
  settled: boolean;
  notes?: string;
  category?: string;
  participantIds: string[]; // Always sync with participants
  createdByName?: string; // Cache for UI
}
