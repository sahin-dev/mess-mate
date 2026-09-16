"use client";

import { useState } from "react";
import { AddExpenseModal } from "@/components/entry-modals";
import { ExpensesView } from "@/components/views/expenses";

export default function ExpensesPage() {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <ExpensesView onAddExpense={() => setAdding(true)} />
      {adding && <AddExpenseModal onClose={() => setAdding(false)} />}
    </>
  );
}
