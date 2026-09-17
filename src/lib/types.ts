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
  /** "requested" is a pending join request, awaiting a manager. */
  status: "active" | "invited" | "requested";
  joinedAt: string;
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
  property: MessProperty;
  facilities: Facility[];
  listings: Listing[];
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
  /**
   * Every member's entries for the period, so a manager can record on behalf of
   * someone else. Only sent to managers; members receive their own in `meals`.
   */
  memberMeals: Record<string, MealEntry[]>;
};

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
