"use client";

import { useState } from "react";
import { AddExpenseModal } from "@/components/entry-modals";
import { OverviewView } from "@/components/views/overview";

export default function OverviewPage() {
  const [addingExpense, setAddingExpense] = useState(false);
  return (
    <>
      <OverviewView onAddExpense={() => setAddingExpense(true)} />
      {addingExpense && <AddExpenseModal onClose={() => setAddingExpense(false)} />}
    </>
  );
}
