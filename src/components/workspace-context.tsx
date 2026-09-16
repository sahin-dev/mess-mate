"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isPeriod, type Period } from "@/lib/period";
import { periodInZone } from "@/lib/timezone";
import type { WorkspaceData } from "@/lib/types";
import type { ConfirmRequest } from "@/components/ui";

export type Panel = "notifications" | "help" | null;
export type Toast = { id: number; message: string; tone: "success" | "error" };

type WorkspaceContextValue = {
  data: WorkspaceData;
  busy: boolean;
  /** True while a different month is being loaded. */
  switchingPeriod: boolean;
  runAction: (
    action: string,
    payload?: Record<string, unknown>,
    successMessage?: string,
  ) => Promise<WorkspaceData | null>;
  notify: (message: string, tone?: "success" | "error") => void;
  confirm: (request: ConfirmRequest) => void;
  setPeriod: (period: Period) => void;
  panel: Panel;
  openPanel: (panel: Panel) => void;
  isManager: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside the workspace shell.");
  return context;
}

export async function requestJson<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      url,
      body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : { cache: "no-store" },
    );
  } catch {
    throw new Error("You appear to be offline. Check your connection and try again.");
  }
  const payload = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

export function WorkspaceProvider({
  initialData,
  children,
  renderOverlays,
}: {
  initialData: WorkspaceData;
  children: ReactNode;
  renderOverlays: (state: {
    panel: Panel;
    openPanel: (panel: Panel) => void;
    confirmRequest: ConfirmRequest | null;
    closeConfirm: () => void;
    toasts: Toast[];
    dismissToast: (id: number) => void;
  }) => ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((message: string, tone: "success" | "error" = "success") => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    // Errors stay longer, because they usually need to be read and acted on.
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      tone === "error" ? 7000 : 3600,
    );
  }, []);

  /**
   * The month lives in `?month=`, so a link to a past month can be shared and
   * survives a refresh. The layout above cannot read search params, so the
   * switch is resolved here. "Switching" is derived rather than stored, which
   * keeps the effect free of synchronous state updates.
   */
  const requestedMonth = searchParams.get("month");
  // "This month" is whichever month the mess is currently living in.
  const messPeriod = periodInZone(data.settings.timezone);
  const wantedPeriod = isPeriod(requestedMonth) ? requestedMonth : messPeriod;
  const switchingPeriod = wantedPeriod !== data.period;

  const goToPeriodUrl = useCallback(
    (period: Period) => {
      const params = new URLSearchParams(searchParams.toString());
      if (period === messPeriod) params.delete("month");
      else params.set("month", period);
      const query = params.toString();
      router.replace(query ? `?${query}` : window.location.pathname, { scroll: false });
    },
    [router, searchParams, messPeriod],
  );

  useEffect(() => {
    if (wantedPeriod === data.period) return;
    let active = true;
    requestJson<WorkspaceData>(`/api/workspace?period=${wantedPeriod}`)
      .then((next) => {
        if (active) setData(next);
      })
      .catch((error: unknown) => {
        if (!active) return;
        notify(
          error instanceof Error ? error.message : "That month could not be loaded.",
          "error",
        );
        // Put the URL back to the month that is actually loaded, so the picker
        // and the figures on screen cannot disagree — and so this does not retry.
        goToPeriodUrl(data.period);
      });
    return () => {
      active = false;
    };
  }, [wantedPeriod, data.period, notify, goToPeriodUrl]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const runAction = useCallback(
    async (action: string, payload: Record<string, unknown> = {}, successMessage?: string) => {
      setBusy(true);
      try {
        const next = await requestJson<WorkspaceData>("/api/workspace", {
          action,
          period: data.period,
          ...payload,
        });
        setData(next);
        if (successMessage) notify(successMessage);
        return next;
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "The request could not be completed.",
          "error",
        );
        return null;
      } finally {
        setBusy(false);
      }
    },
    [data.period, notify],
  );

  const setPeriod = useCallback(
    (period: Period) => {
      if (isPeriod(period) && period !== data.period) goToPeriodUrl(period);
    },
    [data.period, goToPeriodUrl],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      data,
      busy,
      switchingPeriod,
      runAction,
      notify,
      confirm: setConfirmRequest,
      setPeriod,
      panel,
      openPanel: setPanel,
      isManager: data.workspace.role === "manager" || data.workspace.role === "admin",
    }),
    [data, busy, switchingPeriod, runAction, notify, setPeriod, panel],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      {renderOverlays({
        panel,
        openPanel: setPanel,
        confirmRequest,
        closeConfirm: () => setConfirmRequest(null),
        toasts,
        dismissToast,
      })}
    </WorkspaceContext.Provider>
  );
}
