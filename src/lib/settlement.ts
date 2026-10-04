import type { Period } from "@/lib/period";
import { todayInZone } from "@/lib/timezone";
import type { MemberSettlement, Settlement } from "@/lib/types";

/**
 * Everything the settlement needs, in the shape the database already stores.
 * Amounts are whole or fractional taka; rounding happens once, at the end.
 */
export type SettlementInput = {
  period: Period;
  members: {
    id: string;
    name: string;
    status: string;
    roomId: string | null;
    joinedAt?: string;
    leftAt?: string;
    membershipPeriods?: { from: string; to: string | null }[];
  }[];
  rooms: { id: string; rent: number }[];
  /** Every member's meals for the period, not just the signed-in one. */
  meals: {
    userId: string;
    date: string;
    breakfast: number;
    lunch: number;
    dinner: number;
    status?: string;
  }[];
  bazar: { memberId: string; date: string; amount: number; status: string }[];
  expenses: {
    amount: number;
    category: string;
    date: string;
    splitMethod: string;
    paidById: string;
    shares?: { memberId: string; amount: number }[];
  }[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;

type SettlementMember = SettlementInput["members"][number];

/** Membership is evaluated on the transaction date, never from today's status. */
export function memberActiveOn(member: SettlementMember, date: string) {
  const periods = member.membershipPeriods?.length
    ? member.membershipPeriods
    : member.joinedAt
      ? [{ from: member.joinedAt.slice(0, 10), to: member.leftAt?.slice(0, 10) ?? null }]
      : [];
  if (periods.length) {
    return periods.some(({ from, to }) => from <= date && (!to || date <= to));
  }
  return member.status === "active";
}

function memberWasPresent(member: SettlementMember, period: Period) {
  const start = `${period}-01`;
  const end = `${period}-31`;
  const periods = member.membershipPeriods?.length
    ? member.membershipPeriods
    : member.joinedAt
      ? [{ from: member.joinedAt.slice(0, 10), to: member.leftAt?.slice(0, 10) ?? null }]
      : [];
  if (periods.length) return periods.some(({ from, to }) => from <= end && (!to || to >= start));
  return member.status === "active";
}

/**
 * Creates the immutable allocation saved with a new expense. This is also used
 * for legacy expenses that predate allocation snapshots.
 */
export function allocateExpenseShares(
  expense: { amount: number; date: string; splitMethod: string },
  members: SettlementMember[],
  rooms: SettlementInput["rooms"],
) {
  const active = members.filter((member) => memberActiveOn(member, expense.date));
  if (!active.length) return [];

  const rentById = new Map(rooms.map((room) => [room.id, room.rent]));
  const occupants = new Map<string, number>();
  for (const member of active) {
    if (member.roomId) occupants.set(member.roomId, (occupants.get(member.roomId) ?? 0) + 1);
  }
  const weights = active.map((member) => {
    const rent = member.roomId ? rentById.get(member.roomId) ?? 0 : 0;
    const occupantsInRoom = member.roomId ? occupants.get(member.roomId) ?? 1 : 1;
    return { memberId: member.id, weight: rent / occupantsInRoom };
  });
  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  const useRent = expense.splitMethod === "By room" && totalWeight > 0;

  // Make the final share absorb any rounding remainder, keeping the snapshot
  // exactly equal to the bill total down to the paisa.
  let allocated = 0;
  return weights.map((item, index) => {
    const amount =
      index === weights.length - 1
        ? round2(expense.amount - allocated)
        : round2(
            useRent
              ? expense.amount * (item.weight / totalWeight)
              : expense.amount / weights.length,
          );
    allocated += amount;
    return { memberId: item.memberId, amount };
  });
}

/**
 * How a mess actually settles a month:
 *
 *  - Approved bazar is the food pot. Divided by the total meals everyone ate,
 *    it gives the meal rate, so a member who ate more pays more.
 *  - Other expenses are split either equally or in proportion to what each
 *    member pays in rent, depending on the expense's split method.
 *  - Whoever submitted the bazar or recorded the expense paid for it up front.
 *
 * A member's balance is therefore (what they paid) minus (what they consumed).
 * A positive balance means the mess owes them; negative means they owe the mess.
 */
export function computeSettlement(input: SettlementInput): Settlement {
  const participants = input.members.filter((member) => memberWasPresent(member, input.period));
  const participantIds = new Set(participants.map((member) => member.id));
  const membersById = new Map(input.members.map((member) => [member.id, member]));

  const approvedBazar = input.bazar.filter((entry) => entry.status === "Approved");
  const bazarTotal = approvedBazar.reduce((sum, entry) => sum + entry.amount, 0);
  const pendingBazarTotal = input.bazar
    .filter((entry) => entry.status === "Pending")
    .reduce((sum, entry) => sum + entry.amount, 0);

  const mealsByMember = new Map<string, number>();
  let totalMeals = 0;
  for (const entry of input.meals) {
    if (entry.status === "Pending" || entry.status === "Rejected") continue;
    const member = membersById.get(entry.userId);
    if (!member || !memberActiveOn(member, entry.date)) continue;
    const count = entry.breakfast + entry.lunch + entry.dinner;
    if (count <= 0) continue;
    totalMeals += count;
    mealsByMember.set(entry.userId, (mealsByMember.get(entry.userId) ?? 0) + count);
  }
  const mealRate = totalMeals > 0 ? bazarTotal / totalMeals : 0;

  const paid = new Map<string, number>();
  const expenseShare = new Map<string, number>();
  const credit = (map: Map<string, number>, id: string, amount: number) => {
    if (!participantIds.has(id)) return;
    map.set(id, (map.get(id) ?? 0) + amount);
  };

  for (const entry of approvedBazar) {
    const member = membersById.get(entry.memberId);
    if (member && memberActiveOn(member, entry.date)) credit(paid, entry.memberId, entry.amount);
  }

  let expenseTotal = 0;
  for (const expense of input.expenses) {
    expenseTotal += expense.amount;
    credit(paid, expense.paidById, expense.amount);
    const shares = expense.shares?.length
      ? expense.shares
      : allocateExpenseShares(expense, input.members, input.rooms);
    for (const share of shares) {
      credit(expenseShare, share.memberId, share.amount);
    }
  }

  const members: MemberSettlement[] = participants.map((member) => {
    const meals = mealsByMember.get(member.id) ?? 0;
    const mealCost = meals * mealRate;
    const share = expenseShare.get(member.id) ?? 0;
    const paidAmount = paid.get(member.id) ?? 0;
    return {
      memberId: member.id,
      meals,
      mealCost: round2(mealCost),
      expenseShare: round2(share),
      paid: round2(paidAmount),
      balance: round2(paidAmount - mealCost - share),
    };
  });

  const categories = new Map<string, number>();
  for (const expense of input.expenses) {
    categories.set(expense.category, (categories.get(expense.category) ?? 0) + expense.amount);
  }
  const byCategory = [
    { label: "Bazar", amount: round2(bazarTotal) },
    ...[...categories.entries()]
      .map(([label, amount]) => ({ label, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
  ].filter((slice) => slice.amount > 0);

  return {
    period: input.period,
    bazarTotal: round2(bazarTotal),
    pendingBazarTotal: round2(pendingBazarTotal),
    expenseTotal: round2(expenseTotal),
    totalMeals,
    mealRate: round2(mealRate),
    members,
    byCategory,
    transfers: settleUp(members, new Map(participants.map((member) => [member.id, member.name]))),
  };
}

/**
 * Turns the balances into the shortest list of payments that clears them:
 * repeatedly match the largest debtor against the largest creditor.
 */
function settleUp(members: MemberSettlement[], names: Map<string, string>) {
  const debtors = members
    .filter((member) => member.balance < -0.005)
    .map((member) => ({ id: member.memberId, amount: -member.balance }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = members
    .filter((member) => member.balance > 0.005)
    .map((member) => ({ id: member.memberId, amount: member.balance }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: Settlement["transfers"] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0.005) {
      transfers.push({
        fromId: debtor.id,
        from: names.get(debtor.id) ?? "Member",
        toId: creditor.id,
        to: names.get(creditor.id) ?? "Member",
        amount: round2(amount),
      });
    }
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount <= 0.005) debtorIndex += 1;
    if (creditor.amount <= 0.005) creditorIndex += 1;
  }
  return transfers;
}

/**
 * Rotates bazar duty over the members in a stable order, so the roster is the
 * same for everyone who looks at it rather than being generated per render.
 */
export function buildRoster(
  members: { id: string; name: string; color: string; status: string; avatarId?: string | null }[],
  frequency: "alternate" | "daily" | "weekly" | "custom",
  timeZone: string,
  at: Date = new Date(),
  slots = 6,
  customDays: number[] = [1, 3, 5],
) {
  const active = members.filter((member) => member.status === "active");
  if (!active.length) return [];
  // Anchor the rotation to a fixed epoch so it does not shift from day to day,
  // and count days from the mess's own calendar rather than the server's.
  const epoch = Date.UTC(2025, 0, 6);
  const [year, month, day] = todayInZone(timeZone, at).split("-").map(Number);
  const start = Date.UTC(year, month - 1, day);
  if (frequency === "custom") {
    const wanted = new Set(customDays.filter((value) => Number.isInteger(value) && value >= 0 && value <= 6));
    if (!wanted.size) return [];
    let rotation = 0;
    for (let cursor = epoch; cursor < start; cursor += 86_400_000) {
      if (wanted.has(new Date(cursor).getUTCDay())) rotation += 1;
    }
    const result = [];
    for (let cursor = start; result.length < slots && cursor < start + 90 * 86_400_000; cursor += 86_400_000) {
      const date = new Date(cursor);
      if (!wanted.has(date.getUTCDay())) continue;
      const member = active[rotation % active.length];
      result.push({
        date: date.toISOString().slice(0, 10),
        memberId: member.id,
        name: member.name,
        color: member.color,
        avatarId: member.avatarId ?? null,
      });
      rotation += 1;
    }
    return result;
  }
  const step = frequency === "daily" ? 1 : frequency === "weekly" ? 7 : 2;
  const elapsed = Math.floor((start - epoch) / 86_400_000);
  const firstSlot = Math.ceil(elapsed / step);
  return Array.from({ length: slots }, (_, index) => {
    const slot = firstSlot + index;
    const member = active[((slot % active.length) + active.length) % active.length];
    const date = new Date(epoch + slot * step * 86_400_000);
    return {
      date: date.toISOString().slice(0, 10),
      memberId: member.id,
      name: member.name,
      color: member.color,
      avatarId: member.avatarId ?? null,
    };
  });
}
