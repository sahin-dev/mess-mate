import type { Period } from "@/lib/period";
import type {
  MoneyAccount,
  MoneyBudget,
  MoneyCategory,
  MoneyData,
  MoneyExpenseCategory,
  MoneyTransaction,
  MoneyTransactionType,
} from "@/lib/types";

export type MoneyTransactionDocument = {
  id: string;
  userId: string;
  type: MoneyTransactionType;
  title: string;
  amount: number;
  date: string;
  category: MoneyCategory;
  account: MoneyAccount;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type MoneyBudgetDocument = {
  id: string;
  userId: string;
  period: Period;
  category: MoneyExpenseCategory;
  amount: number;
  updatedAt: string;
};

type MemberLike = { id: string; status: string; roomId: string | null };
type RoomLike = { id: string; rent: number };
type ExpenseLike = {
  id: string;
  title: string;
  date: string;
  amount: number;
  splitMethod: string;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Returns one member's economic share of a shared bill. The payer is handled
 * by settlement; personal spending tracks what this person consumed, so a
 * reimbursement does not make the bill appear twice.
 */
export function expenseShareForMember(
  expense: ExpenseLike,
  memberId: string,
  members: MemberLike[],
  rooms: RoomLike[],
) {
  const active = members.filter((member) => member.status === "active");
  const member = active.find((entry) => entry.id === memberId);
  if (!member || active.length === 0) return 0;
  if (expense.splitMethod !== "By room") return round2(expense.amount / active.length);

  const rentByRoom = new Map(rooms.map((room) => [room.id, room.rent]));
  const occupants = new Map<string, number>();
  for (const entry of active) {
    if (entry.roomId) occupants.set(entry.roomId, (occupants.get(entry.roomId) ?? 0) + 1);
  }
  const weightFor = (entry: MemberLike) => {
    if (!entry.roomId) return 0;
    return (rentByRoom.get(entry.roomId) ?? 0) / (occupants.get(entry.roomId) ?? 1);
  };
  const totalWeight = active.reduce((sum, entry) => sum + weightFor(entry), 0);
  if (totalWeight <= 0) return round2(expense.amount / active.length);
  return round2(expense.amount * (weightFor(member) / totalWeight));
}

export function buildMoneyData(input: {
  period: Period;
  userId: string;
  members: MemberLike[];
  rooms: RoomLike[];
  expenses: ExpenseLike[];
  mealCost: number;
  mealCount: number;
  manualTransactions: MoneyTransactionDocument[];
  budgets: MoneyBudgetDocument[];
}): MoneyData {
  const manual: MoneyTransaction[] = input.manualTransactions.map((entry) => ({
    id: entry.id,
    type: entry.type,
    title: entry.title,
    amount: round2(entry.amount),
    date: entry.date,
    category: entry.category,
    account: entry.account,
    note: entry.note,
    source: "manual",
  }));

  const living: MoneyTransaction[] = input.expenses
    .map((expense) => ({
      id: `mess:${expense.id}`,
      type: "Expense" as const,
      title: expense.title,
      amount: expenseShareForMember(expense, input.userId, input.members, input.rooms),
      date: expense.date,
      category: "Living" as const,
      account: "MessMate" as const,
      note: "Your automatically calculated share of this mess expense.",
      source: "mess" as const,
      sourceLabel: "Shared expense",
    }))
    .filter((entry) => entry.amount > 0);

  if (input.mealCost > 0) {
    living.push({
      id: `mess:meals:${input.period}`,
      type: "Expense",
      title: "Mess meals",
      amount: round2(input.mealCost),
      date: `${input.period}-01`,
      category: "Living",
      account: "MessMate",
      note: `${input.mealCount} meal${input.mealCount === 1 ? "" : "s"} at this month's meal rate.`,
      source: "mess",
      sourceLabel: "Meal settlement",
    });
  }

  const transactions = [...manual, ...living].sort(
    (a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title),
  );
  const income = round2(
    transactions
      .filter((entry) => entry.type === "Income")
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
  const expenses = round2(
    transactions
      .filter((entry) => entry.type === "Expense")
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
  const categoryTotals = new Map<MoneyExpenseCategory, number>();
  for (const entry of transactions) {
    if (entry.type !== "Expense") continue;
    const category = entry.category as MoneyExpenseCategory;
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + entry.amount);
  }
  const byCategory = [...categoryTotals.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);
  const budgetRows: MoneyBudget[] = input.budgets
    .map((entry) => ({
      category: entry.category,
      amount: round2(entry.amount),
      spent: round2(categoryTotals.get(entry.category) ?? 0),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
  const budget = round2(budgetRows.reduce((sum, entry) => sum + entry.amount, 0));
  const budgetSpent = round2(budgetRows.reduce((sum, entry) => sum + entry.spent, 0));

  return {
    transactions,
    budgets: budgetRows,
    summary: {
      income,
      expenses,
      net: round2(income - expenses),
      budget,
      // Spending in an unbudgeted category must not consume an unrelated
      // category's limit; only rows with an explicit budget contribute here.
      budgetRemaining: round2(budget - budgetSpent),
      savingsRate: income > 0 ? round2(((income - expenses) / income) * 100) : null,
      livingExpenses: round2(categoryTotals.get("Living") ?? 0),
    },
    byCategory,
  };
}
