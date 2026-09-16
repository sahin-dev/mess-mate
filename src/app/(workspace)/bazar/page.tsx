"use client";

import { useState } from "react";
import { AddBazarModal } from "@/components/entry-modals";
import { BazarView } from "@/components/views/bazar";

export default function BazarPage() {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <BazarView onAddBazar={() => setAdding(true)} />
      {adding && <AddBazarModal onClose={() => setAdding(false)} />}
    </>
  );
}
