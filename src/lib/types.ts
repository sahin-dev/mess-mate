import type { Period } from "@/lib/period";

export type UserRole = "manager" | "member" | "admin";
export type MealKey = "breakfast" | "lunch" | "dinner";
export type ExpenseCategory = "Fixed" | "Utility" | "Maintenance" | "Other";
export type SplitMethod = "All members equally" | "By room";

export type Workspace = {
  role: UserRole;
  messId: string;
  messName: string;
  location: string;
  joinCode: string;
  userId: string;
  userName: string;
  userEmail: string;
  memberCount: number;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  role: "Manager" | "Member" | "Invited";
  roomId: string | null;
  room: string;
  status: "active" | "invited";
  joinedAt: string;
  color: string;
  /** Everything below is derived from the selected period, never stored. */
  meals: number;
  mealCost: number;
  expenseShare: number;
  paid: number;
  balance: number;
};

export type Room = {
  id: string;
  name: string;
  type: string;
  rent: number;
  capacity: number;
  accent: "coral" | "blue" | "green" | "gold";
};

export type MealEntry = Record<MealKey, number> & {
  id: string;
  date: string;
  status: "Open" | "Closed" | "Pending";
};

export type Expense = {
  id: string;
  title: string;
  category: ExpenseCategory;
  date: string;
  amount: number;
  splitMethod: SplitMethod;
  paidBy: string;
  paidById: string;
};

export type BazarEntry = {
  id: string;
  by: string;
  memberId: string;
  date: string;
  items: { name: string; quantity: string }[];
  amount: number;
  status: "Pending" | "Approved";
  proofName?: string;
  hasProof: boolean;
};

export type MessSettings = {
  mealTypes: Record<MealKey, boolean>;
  allowAnytime: boolean;
  cutoff: string;
  /** IANA name, e.g. "Asia/Dhaka". Cutoffs and "today" are evaluated here. */
  timezone: string;
  mealApproval: boolean;
  bazarApproval: boolean;
  requireProof: boolean;
  rosterFrequency: "alternate" | "daily" | "weekly" | "custom";
  notifications: {
    cutoff: boolean;
    roster: boolean;
    settlement: boolean;
  };
  fixedExpenses: { id: string; title: string; amount: number }[];
};

export type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  tone: "green" | "coral" | "blue";
};

/** One member's position for the selected period. */
export type MemberSettlement = {
  memberId: string;
  meals: number;
  mealCost: number;
  expenseShare: number;
  paid: number;
  balance: number;
};

export type Settlement = {
  period: Period;
  /** Approved bazar for the period — the pot that the meal rate divides. */
  bazarTotal: number;
  pendingBazarTotal: number;
  expenseTotal: number;
  totalMeals: number;
  mealRate: number;
  members: MemberSettlement[];
  byCategory: { label: string; amount: number }[];
  /** Who pays whom to close the month, fewest transfers first. */
  transfers: { fromId: string; from: string; toId: string; to: string; amount: number }[];
};

export type TrendPoint = {
  period: Period;
  label: string;
  meals: number;
  bazar: number;
  mealRate: number;
};

export type WorkspaceData = {
  workspace: Workspace;
  /** False when no mail transport is configured, so the UI can say so. */
  emailEnabled: boolean;
  period: Period;
  periods: Period[];
  members: Member[];
  rooms: Room[];
  /** The signed-in member's own entries for the period. */
  meals: MealEntry[];
  expenses: Expense[];
  bazar: BazarEntry[];
  settings: MessSettings;
  activity: ActivityItem[];
  settlement: Settlement;
  trend: TrendPoint[];
  roster: { date: string; memberId: string; name: string; color: string }[];
};

export type AuthResponse = {
  user: { id: string; name: string; email: string } | null;
  workspace: Workspace | null;
};

export type AdminData = {
  stats: {
    users: number;
    messes: number;
    meals: number;
    expenseVolume: number;
    bazar: number;
    rooms: number;
    activeMesses: number;
  };
  messes: {
    id: string;
    name: string;
    manager: string;
    members: number;
    entries: number;
    location: string;
    createdAt: string;
    status: "Active" | "Setup";
  }[];
  users: {
    id: string;
    name: string;
    email: string;
    role: "Admin" | "Manager" | "Member";
    messes: number;
    joinedAt: string;
  }[];
  signups: { period: Period; label: string; users: number; messes: number }[];
  featureUsage: { label: string; count: number; share: number }[];
  activity: ActivityItem[];
  databaseLatency: number;
  generatedAt: string;
};
