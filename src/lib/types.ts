import type { Period } from "@/lib/period";

export type UserRole = "manager" | "member" | "admin";
export type MealKey = "breakfast" | "lunch" | "dinner";
export type ExpenseCategory = "Fixed" | "Utility" | "Maintenance" | "Other";
export type SplitMethod = "All members equally" | "By room";

export const MONEY_EXPENSE_CATEGORIES = [
  "Living",
  "Food & dining",
  "Transport",
  "Shopping",
  "Health",
  "Education",
  "Entertainment",
  "Family",
  "Other",
] as const;
export const MONEY_INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Business",
  "Gift",
  "Other",
] as const;
export const MONEY_ACCOUNTS = ["Cash", "Bank", "Mobile wallet", "Card", "Other"] as const;

export type MoneyExpenseCategory = (typeof MONEY_EXPENSE_CATEGORIES)[number];
export type MoneyIncomeCategory = (typeof MONEY_INCOME_CATEGORIES)[number];
export type MoneyCategory = MoneyExpenseCategory | MoneyIncomeCategory;
export type MoneyAccount = (typeof MONEY_ACCOUNTS)[number];
export type MoneyTransactionType = "Income" | "Expense";

export type MoneyTransaction = {
  id: string;
  type: MoneyTransactionType;
  title: string;
  amount: number;
  date: string;
  category: MoneyCategory;
  account: MoneyAccount | "MessMate";
  note: string;
  /** Mess entries are computed from shared costs and cannot be edited here. */
  source: "manual" | "mess";
  sourceLabel?: string;
};

export type MoneyBudget = {
  category: MoneyExpenseCategory;
  amount: number;
  spent: number;
};

export type MoneyData = {
  transactions: MoneyTransaction[];
  budgets: MoneyBudget[];
  summary: {
    income: number;
    expenses: number;
    net: number;
    budget: number;
    budgetRemaining: number;
    savingsRate: number | null;
    livingExpenses: number;
  };
  byCategory: { category: MoneyExpenseCategory; amount: number }[];
};

/** Who can see one piece of a profile. */
export type Visibility = "private" | "mess" | "public";

export type ProfileVisibility = {
  avatar: Visibility;
  email: Visibility;
  phone: Visibility;
};

export type Workspace = {
  role: UserRole;
  messId: string;
  messName: string;
  location: string;
  joinCode: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhone: string;
  /** True for the shared demo accounts, whose profile cannot be edited. */
  isDemo: boolean;
  /** The signed-in member's own choices about who sees what. */
  userVisibility: ProfileVisibility;
  /** Null when the account has no picture and initials are shown instead. */
  userAvatarId: string | null;
  memberCount: number;
  /** The account that created the mess. Only it can hand the mess on. */
  isOwner: boolean;
  /** Member id of the owner, who cannot be demoted or removed. */
  ownerId: string;
  /** Suspended by a platform administrator: readable, but nothing can change. */
  suspended: boolean;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  /** From the person's own account, so it is blank until they fill it in. */
  phone: string;
  avatarId: string | null;
  role: "Manager" | "Member" | "Invited";
  roomId: string | null;
  room: string;
  /** "requested" is a pending join request, awaiting a manager. */
  status: "active" | "invited" | "requested" | "former";
  /** Last attempt to email an invitation. Only relevant while invited. */
  invitationDelivery?: "sent" | "failed" | "unavailable";
  joinedAt: string;
  /** First date whose meals count toward open settlements. */
  mealCountFrom: string;
  /** Last day included in settlement, when this person has left the mess. */
  leftAt?: string;
  color: string;
  /** Everything below is derived from the selected period, never stored. */
  meals: number;
  mealCost: number;
  expenseShare: number;
  paid: number;
  balance: number;
};

export type Furnishing = "unfurnished" | "partly" | "furnished";

export type Room = {
  id: string;
  name: string;
  type: string;
  rent: number;
  capacity: number;
  accent: "coral" | "blue" | "green" | "gold";
  /** What the room itself has. These are what people ask about first. */
  attachedBathroom: boolean;
  balcony: boolean;
  airConditioned: boolean;
  furnishing: Furnishing;
  /** Free text, e.g. "12 x 10 ft, south facing". */
  notes: string;
};

export type ParkingType = "car" | "motorbike" | "both";

/** The building and the flat inside it: everything above the room level. */
export type MessProperty = {
  addressLine: string;
  area: string;
  city: string;
  postcode: string;
  floor: string;
  flatNumber: string;
  hasLift: boolean;
  parking: {
    available: boolean;
    type: ParkingType;
    spots: number;
    /** 0 means it is included in the rent. */
    monthlyCost: number;
    /** How a resident actually gets a space, in the manager's own words. */
    procedure: string;
  };
  coordinates: { lat: number; lng: number } | null;
  notes: string;
};

/** Shared equipment and services: fridge, filter, gas, guard, and so on. */
export type Facility = {
  id: string;
  label: string;
  available: boolean;
  detail: string;
};

/**
 * `pending` is a post a member wrote and sent for approval. Publishing exposes
 * the house's real costs, so only a manager can take that last step.
 */
export type ListingStatus = "draft" | "pending" | "published";
export type PreferredOccupant = "anyone" | "students" | "professionals";

export type OccupantGender = "anyone" | "men" | "women";
export type SmokingRule = "either" | "non-smokers";
export type FoodPreference = "either" | "vegetarian" | "no-beef" | "halal";
export type MaritalPreference = "anyone" | "single" | "family";

/**
 * Who the room would suit.
 *
 * Shared-accommodation adverts in Bangladesh routinely state these, which is
 * why the fields exist. They are all optional, they are shown as the poster's
 * stated preference rather than as a rule, and none of them is used to filter
 * anybody out of search results.
 */
export type TenantPreferences = {
  occupation: PreferredOccupant;
  gender: OccupantGender;
  smoking: SmokingRule;
  food: FoodPreference;
  /** Free text, because a fixed list would be wrong more often than right. */
  religion: string;
  maritalStatus: MaritalPreference;
  /** Anything else about who would suit the room. */
  notes: string;
};

/** A house rule, e.g. "Lights off by midnight — the room is shared." */
export type HouseRule = {
  id: string;
  text: string;
};

export type ListingPhoto = {
  id: string;
  caption: string;
  width: number;
  height: number;
};

export type Listing = {
  id: string;
  slug: string;
  roomId: string;
  roomName: string;
  status: ListingStatus;
  /** The post headline, e.g. "Quiet room for a student, Uttara sector 7". */
  title: string;
  /** How many people the manager wants to let the room to. */
  seats: number;
  rentPerSeat: number;
  /** The body of the post, written in the poster's own words. */
  description: string;
  availableFrom: string;
  preferredOccupant: PreferredOccupant;
  preferences: TenantPreferences;
  rules: HouseRule[];
  photos: ListingPhoto[];
  /** Who wrote the post. The name is shown publicly; the id never is. */
  authorId: string;
  authorName: string;
  authorRole: "manager" | "member";
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  publishedAt: string | null;
  updatedAt: string;
  /** Set when a platform administrator takes the post down. */
  moderation: ListingModeration | null;
};

export type ListingModeration = {
  removedAt: string;
  reason: string;
};

export type MealEntry = Record<MealKey, number> & {
  id: string;
  date: string;
  status: "Open" | "Closed" | "Pending" | "Rejected";
};

export type MealCounts = Record<MealKey, number>;

/** Independent kitchen log, entered by a manager after food is prepared. */
export type CookedMealEntry = {
  date: string;
  cooked: MealCounts;
  wasted: MealCounts;
  updatedAt: string;
  updatedBy: string;
};

export type MealReconciliationDay = {
  date: string;
  cooked: MealCounts | null;
  wasted: MealCounts;
  approved: MealCounts;
  pending: MealCounts;
  unexplained: MealCounts;
  overclaimed: MealCounts;
};

export type MealReconciliation = {
  days: MealReconciliationDay[];
  totals: { cooked: number; wasted: number; approved: number; pending: number; unexplained: number; overclaimed: number };
  loggedDays: number;
  missingLogDays: number;
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
  /** Identifies the saved monthly bill that generated this entry. */
  recurringKey?: string;
  /** Allocation captured when the bill was created, so later roster changes cannot rewrite history. */
  shares?: { memberId: string; amount: number }[];
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
  /** JavaScript weekday numbers (0 Sunday through 6 Saturday) used by custom rotation. */
  customRosterDays: number[];
  notifications: {
    cutoff: boolean;
    roster: boolean;
    settlement: boolean;
  };
  fixedExpenses: { id: string; title: string; amount: number; paidById?: string; splitMethod?: SplitMethod }[];
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
  transfers: {
    fromId: string;
    from: string;
    toId: string;
    to: string;
    amount: number;
    paymentStatus?: "pending" | "paid";
    paidAt?: string;
    paidBy?: string;
  }[];
};

export type MonthClosure = {
  status: "open" | "closed";
  closedAt: string | null;
  closedBy: string | null;
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
  property: MessProperty;
  facilities: Facility[];
  listings: Listing[];
  period: Period;
  periods: Period[];
  members: Member[];
  rooms: Room[];
  /** The signed-in member's own entries for the period. */
  meals: MealEntry[];
  cookedMeals: CookedMealEntry[];
  mealReconciliation: MealReconciliation;
  expenses: Expense[];
  bazar: BazarEntry[];
  settings: MessSettings;
  activity: ActivityItem[];
  settlement: Settlement;
  closure: MonthClosure;
  /** Private to the signed-in account; never shared with mess managers. */
  money: MoneyData;
  trend: TrendPoint[];
  roster: {
    date: string;
    memberId: string;
    name: string;
    color: string;
    avatarId: string | null;
  }[];
  /**
   * Every member's entries for the period, so a manager can record on behalf of
   * someone else. Only sent to managers; members receive their own in `meals`.
   */
  memberMeals: Record<string, MealEntry[]>;
  /** The mess notice board, pinned first and then newest first. */
  notices: Notice[];
  /** Platform announcements currently running for this account. */
  announcements: AnnouncementBanner[];
};

/** A note a manager pins up for the whole house: "Water off Sunday 10–2". */
export type Notice = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  authorId: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

export type AnnouncementTone = "info" | "warning" | "success";
export type AnnouncementAudience = "everyone" | "managers";

/** A message from the platform team, shown across the top of every workspace. */
export type Announcement = {
  id: string;
  title: string;
  body: string;
  tone: AnnouncementTone;
  audience: AnnouncementAudience;
  startsAt: string;
  /** Null runs until an administrator ends it. */
  endsAt: string | null;
  createdAt: string;
  createdBy: string;
};

export type AnnouncementBanner = Pick<Announcement, "id" | "title" | "body" | "tone">;

/** What the signed-in user sees before they belong to a mess. */
export type PendingRequest = {
  messId: string;
  messName: string;
  location: string;
  requestedAt: string;
};

export type AuthResponse = {
  user: { id: string; name: string; email: string } | null;
  workspace: Workspace | null;
};

/** The admin overview: platform-wide counts and what needs attention. */
export type AdminOverview = {
  stats: {
    users: number;
    messes: number;
    meals: number;
    expenseVolume: number;
    bazar: number;
    rooms: number;
    activeMesses: number;
    publishedListings: number;
    /**
     * Accounts whose tab reported in within the presence window: people
     * actually looking at the site. Not the same as holding a session, which
     * lasts thirty days and says nothing about where anybody is now.
     */
    onlineNow: number;
    /** Accounts that made a request inside the window, by `lastSeenAt`. */
    activeDay: number;
    activeWeek: number;
    activeMonth: number;
    /**
     * True until every account has been seen at least once. Activity is only
     * recorded from the moment the feature shipped, so the first weeks under-
     * report and the dashboard has to say so rather than imply a decline.
     */
    activityPartial: boolean;
  };
  /** Work waiting on a platform administrator. */
  queue: {
    openReports: number;
    suspendedUsers: number;
    suspendedMesses: number;
    runningAnnouncements: number;
  };
  signups: { period: Period; label: string; users: number; messes: number }[];
  featureUsage: { label: string; count: number; share: number }[];
  recentMesses: AdminMessRow[];
  activity: AdminActivityRow[];
  /** Configuration problems worth fixing before (or after) going live. */
  warnings: AdminHealthCheck[];
  databaseLatency: number;
  generatedAt: string;
};

export type AdminPage<T> = {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminUserRole = "Admin" | "Manager" | "Member" | "No mess";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: AdminUserRole;
  messId: string | null;
  messName: string | null;
  joinedAt: string;
  lastSeenAt: string | null;
  suspended: boolean;
  suspendedReason: string;
  /** The shared demo accounts cannot be suspended or demoted. */
  isDemo: boolean;
  isSelf: boolean;
};

export type AdminUserDetail = AdminUserRow & {
  phone: string;
  sessions: number;
  memberships: {
    messId: string;
    messName: string;
    role: string;
    status: string;
    joinedAt: string;
    leftAt: string | null;
  }[];
  listings: number;
  audit: AdminAuditRow[];
};

export type AdminMessStatus = "Active" | "Setup" | "Suspended";

export type AdminMessRow = {
  id: string;
  name: string;
  manager: string;
  managerEmail: string;
  members: number;
  entries: number;
  location: string;
  createdAt: string;
  lastActivityAt: string | null;
  status: AdminMessStatus;
  suspendedReason: string;
};

export type AdminMessDetail = AdminMessRow & {
  joinCode: string;
  timezone: string;
  rooms: number;
  closedMonths: number;
  counts: { meals: number; bazar: number; expenses: number; listings: number };
  roster: {
    id: string;
    userId: string | null;
    name: string;
    email: string;
    role: string;
    status: string;
    joinedAt: string;
  }[];
  activity: AdminActivityRow[];
};

export type AdminListingRow = {
  id: string;
  slug: string;
  title: string;
  roomName: string;
  messId: string;
  messName: string;
  status: ListingStatus;
  authorName: string;
  publishedAt: string | null;
  updatedAt: string;
  openReports: number;
  /** Taken down by a platform administrator; the manager cannot republish it. */
  removedByAdmin: boolean;
  removalReason: string;
};

export type ListingReportReason =
  | "scam"
  | "unavailable"
  | "misleading"
  | "discriminatory"
  | "offensive"
  | "other";

export type AdminReportRow = {
  id: string;
  listingId: string;
  listingTitle: string;
  slug: string;
  messName: string;
  reason: ListingReportReason;
  details: string;
  contact: string;
  status: "open" | "actioned" | "dismissed";
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
};

export type AdminAuditRow = {
  id: string;
  actorName: string;
  action: string;
  targetType: "user" | "mess" | "listing" | "report" | "announcement" | "platform";
  targetId: string | null;
  targetLabel: string;
  detail: string;
  createdAt: string;
};

export type AdminActivityRow = ActivityItem & { messId: string; messName: string };

export type AdminAnnouncementRow = Announcement & {
  state: "scheduled" | "running" | "ended";
};

export type AdminHealthCheck = {
  id: string;
  label: string;
  status: "ok" | "warn" | "error";
  detail: string;
};

export type AdminHealth = {
  checks: AdminHealthCheck[];
  database: {
    latencyMs: number;
    name: string;
    dataSizeBytes: number | null;
    storageSizeBytes: number | null;
    collections: { name: string; documents: number }[];
  };
  runtime: {
    node: string;
    uptimeSeconds: number;
    memoryMb: number;
    environment: string;
  };
  generatedAt: string;
};
