export type SharedVault = {
  id?: string;
  name: string;
  description?: string;
  budget: number;
  currency: string;
  memberIds: string[];
  ownerId: string;
  themeColor: string;
  createdAt?: any;
};
