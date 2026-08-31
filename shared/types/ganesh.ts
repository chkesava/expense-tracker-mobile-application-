export type GaneshRole = "admin" | "treasurer" | "member" | "collector" | "viewer";
export type GaneshMemberStatus = "active" | "suspended" | "removed";
export type PandalJoinMode = "approval" | "open";
export type FestivalStatus = "open" | "closed";
export type ContributionMode = "same" | "custom";

export type PaymentMethod = "cash" | "upi" | "bank" | "other";
export type OpeningFundSource =
  | "cash"
  | "upi"
  | "bank"
  | "previous_balance"
  | "permanent_fund"
  | "other";

export type PermanentFundLocation = "cash" | "upi" | "bank" | "other";

export type PermanentFundTxType =
  | "INITIAL_BALANCE"
  | "CARRY_FORWARD"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "DONATION"
  | "ADJUSTMENT";

export type PermanentFundPartyType = "PERMANENT_FUND" | "FESTIVAL" | "EXTERNAL";

export type FestivalFundTransferDirection = "to_permanent" | "from_permanent";

export type HouseholdStatus =
  | "pending"
  | "partial"
  | "paid"
  | "not_interested"
  | "not_available";

export type ContributionKind = "money" | "item" | "service" | "sponsorship";
export type ContributionStatus = "promised" | "received" | "cancelled";

export type GaneshLedgerType =
  | "OPENING_BALANCE"
  | "COLLECTION"
  | "COMMITTEE_CONTRIBUTION"
  | "OTHER_DONATION"
  | "EXPENSE"
  | "REIMBURSEMENT"
  | "ADJUSTMENT";

export type JoinRequestStatus = "pending" | "approved" | "rejected";

export type GaneshFileMeta = {
  path: string;
  fileName: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  uploadedAt?: string;
  uploadedBy?: string;
};

export type AuditAction =
  | "created"
  | "edited"
  | "voided"
  | "reimbursed"
  | "adjusted"
  | "closed"
  | "transferred"
  | "reopened";

export type FirestoreTime = {
  seconds?: number;
  nanoseconds?: number;
  toDate?: () => Date;
} | null;

export interface GaneshAuditFields {
  createdBy: string;
  createdAt?: FirestoreTime;
  updatedBy: string;
  updatedAt?: FirestoreTime;
}

export interface GaneshVoidFields {
  voided?: boolean;
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: FirestoreTime;
}

export interface Pandal extends GaneshAuditFields {
  id: string;
  name: string;
  area?: string;
  description?: string;
  code: string;
  ownerId: string;
  memberIds: string[];
  joinMode?: PandalJoinMode;
  adminCount?: number;
  contactPhone?: string;
}

export interface PandalInvite {
  id: string;
  pandalId: string;
  name: string;
  joinMode?: PandalJoinMode;
  createdBy: string;
  createdAt?: FirestoreTime;
}

export interface PandalJoinRequest {
  id: string;
  pandalId: string;
  pandalName?: string;
  userId: string;
  displayName: string;
  phone?: string;
  status: JoinRequestStatus;
  createdAt?: FirestoreTime;
  updatedAt?: FirestoreTime;
  decidedBy?: string;
}

export interface PandalMembershipIndex {
  id: string;
  pandalId: string;
  role: GaneshRole;
  status?: GaneshMemberStatus;
  pandalName?: string;
  joinedAt?: FirestoreTime;
}

export type PandalRoleType = "builtin" | "custom";
export type PandalMemberAuditAction =
  | "role_changed"
  | "suspended"
  | "removed"
  | "approved"
  | "rejected"
  | "joined"
  | "pandal_created"
  | "join_mode"
  | "role_assigned"
  | "role_unassigned"
  | "make_admin"
  | "remove_admin"
  | "role_permissions";

export interface PandalRole {
  id: string;
  name: string;
  nameKey: string;
  description?: string;
  type: PandalRoleType;
  permissions: import("@/shared/utils/ganeshPermissions").GaneshPermission[];
  createdBy: string;
  createdAt?: FirestoreTime;
  updatedBy: string;
  updatedAt?: FirestoreTime;
}

export interface PandalMemberAudit {
  id: string;
  actorId: string;
  targetUserId: string;
  action: PandalMemberAuditAction;
  oldRole?: GaneshRole;
  newRole?: GaneshRole;
  oldStatus?: GaneshMemberStatus;
  newStatus?: GaneshMemberStatus;
  roleId?: string;
  roleName?: string;
  oldPermissions?: string[];
  newPermissions?: string[];
  reason?: string;
  at?: FirestoreTime;
}

export type AssetOwnershipType = "purchased" | "donated" | "sponsored" | "transferred" | "other";
export type AssetCondition = "new" | "good" | "fair" | "damaged" | "unusable";
export type AssetStatus = "available" | "in_use" | "damaged" | "lost" | "disposed";
export type AssetCategory =
  | "furniture"
  | "sound"
  | "lighting"
  | "electrical"
  | "kitchen"
  | "decoration"
  | "pooja"
  | "storage"
  | "other";
export type AssetUnit = "pieces" | "sets" | "meters" | "other";
export type PandalAssetAuditAction =
  | "created"
  | "edited"
  | "quantity"
  | "status"
  | "disposed"
  | "photo";

export type GaneshExpenseType = "normal" | "asset_purchase";

export type SponsorType = "person" | "business" | "organization" | "other";
export type SponsoringType = "cash" | "item" | "service" | "expense";
export type SponsorshipStatus =
  | "prospective"
  | "promised"
  | "confirmed"
  | "received"
  | "cancelled";
export type SponsorshipPurpose =
  | "ganesh_idol"
  | "decoration"
  | "sound"
  | "lighting"
  | "prasadam"
  | "food"
  | "pooja"
  | "immersion"
  | "cultural"
  | "other";
export type PandalSponsorAuditAction = "created" | "edited" | "photo";

export interface PandalSponsor extends GaneshAuditFields {
  id: string;
  name: string;
  type: SponsorType;
  mobile?: string;
  email?: string;
  address?: string;
  notes?: string;
  photo?: GaneshFileMeta;
  pendingWrite?: boolean;
}

export interface PandalSponsorAudit {
  id: string;
  actorId: string;
  sponsorId: string;
  action: PandalSponsorAuditAction;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  at?: FirestoreTime;
}

export interface GaneshSponsorship extends GaneshAuditFields {
  id: string;
  sponsorId: string;
  sponsoringType: SponsoringType;
  purpose: SponsorshipPurpose;
  purposeLabel?: string;
  status: SponsorshipStatus;
  amount: number;
  estimatedValue: number;
  itemName?: string;
  quantity?: string;
  serviceDescription?: string;
  expectedDate?: string;
  paymentMethod?: PaymentMethod;
  receivedAt?: FirestoreTime;
  receivedBy?: string;
  receivedNotes?: string;
  cancelReason?: string;
  contributionId?: string;
  expenseId?: string;
  assetId?: string;
  notes?: string;
  pendingWrite?: boolean;
}

export interface PandalAsset extends GaneshAuditFields {
  id: string;
  name: string;
  category: AssetCategory;
  quantity: number;
  unit: AssetUnit;
  ownershipType: AssetOwnershipType;
  estimatedValue: number;
  condition: AssetCondition;
  status: AssetStatus;
  location?: string;
  description?: string;
  photo?: GaneshFileMeta;
  sourceName?: string;
  relatedExpenseId?: string;
  relatedExpenseFestivalId?: string;
  relatedContributionId?: string;
  acquisitionCost?: number;
  disposeReason?: string;
  pendingWrite?: boolean;
}

export interface PandalAssetAudit {
  id: string;
  actorId: string;
  assetId: string;
  action: PandalAssetAuditAction;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  at?: FirestoreTime;
}

export interface PandalMember {
  id: string;
  userId: string;
  displayName: string;
  phone?: string;
  role: GaneshRole;
  status: GaneshMemberStatus;
  roleIds?: string[];
  permissions?: import("@/shared/utils/ganeshPermissions").GaneshPermission[];
  permissionOverrides?: import("@/shared/utils/ganeshPermissions").GaneshPermission[];
  createdAt?: FirestoreTime;
  updatedAt?: FirestoreTime;
}

export interface Festival extends GaneshAuditFields {
  id: string;
  name: string;
  year: number;
  status: FestivalStatus;
  contributionMode: ContributionMode;
  contributionTargetAmount: number;
  householdTargetAmount: number;
  /**
   * Festival window, ISO `yyyy-mm-dd`. Optional: festivals created before the
   * seva schedule existed have neither, and every surface degrades to showing
   * just the festival name when they are absent.
   */
  startDate?: string;
  endDate?: string;
  closedAt?: FirestoreTime;
  closedBy?: string;
}

export interface FestivalMember {
  id: string;
  userId: string;
  displayName: string;
  role: GaneshRole;
  contributionTarget: number;
  contributionTargetOverridden?: boolean;
  contributionPaid: number;
  personalExpenses: number;
  reimbursed: number;
  pendingReimbursement: number;
}

export interface GaneshSummary {
  openingFunds: number;
  chanda: number;
  committeeContributions: number;
  otherCashContributions: number;
  godFundExpenses: number;
  reimbursements: number;
  personalMoneyUsed: number;
  pendingReimbursements: number;
  inKindValue: number;
  sponsoredValue: number;
  collectionCount: number;
  expenseCount: number;
  assetPurchaseAmount: number;
  transferredToPermanentFund: number;
  receivedFromPermanentFund: number;
  /** Festival God Fund held as cash. Unclassified history is repaired into `other`. */
  cash: number;
  upi: number;
  bank: number;
  other: number;
  /** Monotonic counter for collection receipt numbers (GS-077). */
  nextReceiptNumber: number;
  updatedAt?: FirestoreTime;
}

export interface OpeningFund extends GaneshAuditFields, GaneshVoidFields {
  id: string;
  amount: number;
  sourceType: OpeningFundSource;
  location?: PermanentFundLocation;
  linkedTransferId?: string;
  description?: string;
  date: string;
  ledgerType: "OPENING_BALANCE";
  pendingWrite?: boolean;
}

export interface PermanentFundSummary {
  total: number;
  cash: number;
  upi: number;
  bank: number;
  other: number;
  updatedBy?: string;
  updatedAt?: FirestoreTime;
}

export interface PermanentFundTransaction extends GaneshAuditFields {
  id: string;
  type: PermanentFundTxType;
  amount: number;
  signedAmount: number;
  location: PermanentFundLocation;
  sourceType: PermanentFundPartyType;
  sourceId?: string;
  destinationType: PermanentFundPartyType;
  destinationId?: string;
  festivalId?: string;
  festivalName?: string;
  description?: string;
  date?: string;
  pendingWrite?: boolean;
}

export interface FestivalFundTransfer extends GaneshAuditFields {
  id: string;
  direction: FestivalFundTransferDirection;
  amount: number;
  location: PermanentFundLocation;
  linkedPermanentTxId: string;
  description?: string;
}

export interface Household {
  id: string;
  name: string;
  houseNumber?: string;
  mobile?: string;
  area?: string;
  expectedAmount: number;
  collectedAmount: number;
  status: HouseholdStatus;
  assignedCollectorId?: string;
  notes?: string;
  createdBy: string;
  createdAt?: FirestoreTime;
  updatedBy: string;
  updatedAt?: FirestoreTime;
  pendingWrite?: boolean;
}

export interface GaneshCollection extends GaneshAuditFields, GaneshVoidFields {
  id: string;
  householdId?: string;
  donorName: string;
  mobile?: string;
  houseNumber?: string;
  address?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  collectorId: string;
  /** Human-readable receipt, e.g. GNS26-000182. Assigned online; may be pending offline. */
  receiptNumber?: string;
  /** Idempotency key for double-tap / retry. Often used as the document id. */
  clientOpId?: string;
  notes?: string;
  date: string;
  ledgerType: "COLLECTION";
  pendingWrite?: boolean;
}

export interface GaneshContribution extends GaneshAuditFields, GaneshVoidFields {
  id: string;
  kind: ContributionKind;
  contributorName: string;
  contributorMemberId?: string;
  mobile?: string;
  itemName?: string;
  quantity?: string;
  amount: number;
  estimatedValue: number;
  isCommitteeContribution?: boolean;
  description?: string;
  date: string;
  expectedDate?: string;
  status: ContributionStatus;
  receivedAt?: FirestoreTime;
  receivedBy?: string;
  receivedNotes?: string;
  paymentMethod?: PaymentMethod;
  cancelReason?: string;
  assetId?: string;
  photoPath?: string;
  photo?: GaneshFileMeta;
  ledgerType?: "COMMITTEE_CONTRIBUTION" | "OTHER_DONATION";
  sponsorId?: string;
  sponsorshipId?: string;
  pendingWrite?: boolean;
}

export interface GaneshExpense extends GaneshAuditFields, GaneshVoidFields {
  id: string;
  name: string;
  totalAmount: number;
  godFundAmount: number;
  personalAmount: number;
  sponsoredAmount: number;
  categoryId: string;
  categoryName: string;
  paidByMemberId: string;
  /** Whether the personal portion should create a reimbursement obligation. */
  reimbursementRequired?: boolean;
  /** Stable client operation id used to make retries safe. */
  clientOpId?: string;
  vendor?: string;
  description?: string;
  notes?: string;
  date: string;
  receiptPath?: string;
  receipt?: GaneshFileMeta;
  linkedContributionId?: string;
  linkedSponsorshipId?: string;
  expenseType?: GaneshExpenseType;
  assetId?: string;
  /**
   * Where God Fund cash left from. Personal / sponsored legs do not move
   * festival Cash / UPI / Bank. Missing on historical records — recompute
   * treats those as `other`.
   */
  paymentMethod?: PaymentMethod;
  ledgerType: "EXPENSE";
  pendingWrite?: boolean;
}

export interface GaneshReimbursement extends GaneshAuditFields, GaneshVoidFields {
  id: string;
  memberId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  date: string;
  notes?: string;
  status: GaneshReimbursementStatus;
  clientOpId?: string;
  ledgerType: "REIMBURSEMENT";
  pendingWrite?: boolean;
}

export type GaneshReimbursementStatus = "paid" | "voided";

export interface GaneshCategory {
  id: string;
  name: string;
  isDefault?: boolean;
  disabled?: boolean;
  sortOrder?: number;
  createdBy?: string;
  createdAt?: FirestoreTime;
  updatedBy?: string;
  updatedAt?: FirestoreTime;
}

export interface GaneshFestivalAudit {
  id: string;
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  at?: FirestoreTime;
}

export interface GaneshActivity {
  id: string;
  title: string;
  subtitle?: string;
  amount?: number;
  estimatedValue?: number;
  actorId: string;
  entityType: string;
  entityId: string;
  createdAt?: FirestoreTime;
  pendingWrite?: boolean;
}

export interface GaneshAuditLog {
  id: string;
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  at?: FirestoreTime;
}

/* --------------------------------------------------------------------- Seva */

/**
 * Seva — the pandal's operational schedule.
 *
 * A seva is an activity the committee runs during a festival: the morning
 * aarti, annadanam, a cultural programme, the visarjan procession. It is
 * deliberately **not** a financial record: a seva carries no amount and never
 * enters `GaneshSummary`, any ledger, or the God Fund. Money spent on an
 * activity is recorded as a `GaneshExpense` exactly as before.
 */
export type SevaKind =
  | "aarti"
  | "annadanam"
  | "prasadam"
  | "bhajan"
  | "cultural"
  | "decoration"
  | "cleaning"
  | "security"
  | "procession"
  | "visarjan"
  | "other";

export type SevaStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

/** A volunteer's duty on one seva. */
export type DutyStatus = "assigned" | "on_duty" | "completed" | "declined";

export interface FestivalSeva extends GaneshAuditFields, GaneshVoidFields {
  id: string;
  name: string;
  kind: SevaKind;
  /** ISO `yyyy-mm-dd`. Stored as a string so it sorts and compares lexically, matching `GaneshContribution.expectedDate`. */
  date: string;
  /** 24-hour `HH:mm`. Same reason. */
  startTime: string;
  endTime?: string;
  location?: string;
  notes?: string;
  status: SevaStatus;
  /** Denormalised count of duties, so a schedule list needs no per-row subquery. */
  dutyCount?: number;
  pendingWrite?: boolean;
}

export interface SevaDuty extends GaneshAuditFields {
  id: string;
  sevaId: string;
  /** The pandal member serving. */
  userId: string;
  displayName: string;
  /** What they are doing, e.g. "Prasadam counter". Free text. */
  roleLabel?: string;
  status: DutyStatus;
  pendingWrite?: boolean;
}

export const EMPTY_GANESH_SUMMARY: GaneshSummary = {
  openingFunds: 0,
  chanda: 0,
  committeeContributions: 0,
  otherCashContributions: 0,
  godFundExpenses: 0,
  reimbursements: 0,
  personalMoneyUsed: 0,
  pendingReimbursements: 0,
  inKindValue: 0,
  sponsoredValue: 0,
  collectionCount: 0,
  expenseCount: 0,
  assetPurchaseAmount: 0,
  transferredToPermanentFund: 0,
  receivedFromPermanentFund: 0,
  cash: 0,
  upi: 0,
  bank: 0,
  other: 0,
  nextReceiptNumber: 0,
};

export const EMPTY_PERMANENT_FUND: PermanentFundSummary = {
  total: 0,
  cash: 0,
  upi: 0,
  bank: 0,
  other: 0,
};
