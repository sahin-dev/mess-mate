"use client";

import {
  ArrowUpRight,
  Building2,
  Check,
  ChevronRight,
  Hourglass,
  KeyRound,
  LockKeyhole,
  MapPin,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PendingRequest, WorkspaceData } from "@/lib/types";
import type { PublicListingCard } from "@/lib/public-listings";
import { AuthScreen, SecureNote } from "@/components/auth-screen";
import { ListingCard } from "@/components/listing-card";
import { ListingSearch } from "@/components/listing-search";
import { ActionButton, CopyButton } from "@/components/ui";
import { requestJson } from "@/components/workspace-context";

type Stage = "find" | "create" | "join" | "created" | "pending";

export function JoinFlow({
  userName,
  pending,
  listings,
  areas,
  searching,
}: {
  userName: string;
  pending: PendingRequest | null;
  listings: PublicListingCard[];
  areas: { area: string; count: number }[];
  searching: boolean;
}) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(pending ? "pending" : "find");
  const [request, setRequest] = useState<PendingRequest | null>(pending);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [messName, setMessName] = useState("");
  const [location, setLocation] = useState("");
  const [memberCount, setMemberCount] = useState("5");
  const [joinInput, setJoinInput] = useState("");
  const [createdCode, setCreatedCode] = useState("");

  const run = async <T,>(callback: () => Promise<T>) => {
    setBusy(true);
    setError("");
    try {
      return await callback();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const enterWorkspace = () => {
    router.replace("/dashboard");
    router.refresh();
  };

  const createMess = async (event: FormEvent) => {
    event.preventDefault();
    const result = await run(() =>
      requestJson<WorkspaceData>("/api/workspace", {
        action: "createMess",
        name: messName,
        location,
        memberCount: Number(memberCount),
      }),
    );
    if (result) {
      setCreatedCode(result.workspace.joinCode);
      setStage("created");
    }
  };

  const joinMess = async (event: FormEvent) => {
    event.preventDefault();
    const code = joinInput.trim().toUpperCase();
    if (code.length < 6) {
      setError("Enter the whole code your manager shared, including the dash.");
      return;
    }
    const result = await run(() =>
      requestJson<{ status: "joined" | "pending"; messName: string }>("/api/workspace", {
        action: "joinMess",
        joinCode: code,
      }),
    );
    if (!result) return;
    // An invitation lets you straight in; anything else waits for a manager.
    if (result.status === "joined") {
      enterWorkspace();
      return;
    }
    setRequest({
      messId: "",
      messName: result.messName,
      location: "",
      requestedAt: new Date().toISOString().slice(0, 10),
    });
    setStage("pending");
  };

  const cancelRequest = async () => {
    const result = await run(() =>
      requestJson<{ ok: boolean }>("/api/workspace", { action: "cancelJoinRequest" }),
    );
    if (result) {
      setRequest(null);
      setJoinInput("");
      setStage("find");
    }
  };

  const back = () => {
    setError("");
    setStage("find");
  };

  const refresh = () => router.refresh();

  return (
    <AuthScreen
      wide={stage === "find"}
      onBack={stage === "create" || stage === "join" ? back : undefined}
    >
      {stage === "find" && (
        <div className="find-step">
          <header className="find-head">
            <span className="auth-kicker">WELCOME, {userName.split(" ")[0].toUpperCase()}</span>
            <h1>Find a room, or set up your own mess.</h1>
            <p>
              Browse rooms to let with the real monthly cost of living there, or use a join code if
              your housemates already run a mess here.
            </p>
          </header>

          <ListingSearch areas={areas} resultCount={listings.length} basePath="/join" />

          {listings.length === 0 ? (
            <p className="find-empty">
              {searching
                ? "No rooms match that search yet. Try a wider area, or clear the filters."
                : "No rooms are listed right now. You can still join a mess with a code, or create your own."}
            </p>
          ) : (
            <ul className="listing-grid">
              {listings.map((listing) => (
                <li key={listing.slug}>
                  <ListingCard listing={listing} />
                </li>
              ))}
            </ul>
          )}

          <div className="find-actions">
            <button type="button" onClick={() => setStage("join")}>
              <span className="choice-icon green" aria-hidden="true">
                <KeyRound size={24} />
              </span>
              <span>
                <strong>I have a join code</strong>
                <small>Ask to join the mess your housemates already run.</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setStage("create")}>
              <span className="choice-icon coral" aria-hidden="true">
                <Building2 size={24} />
              </span>
              <span>
                <strong>Create a new mess</strong>
                <small>Set up the house, invite everyone and manage the month.</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {stage === "create" && (
        <div className="auth-step auth-step-wide">
          <span className="auth-kicker">NEW MESS</span>
          <h1>Tell us about your mess.</h1>
          <p>You can change all of this later, and add rooms once you are inside.</p>
          <form className="auth-form" onSubmit={createMess}>
            <label>
              Mess name
              <span className="input-with-icon">
                <Building2 size={17} aria-hidden="true" />
                <input
                  autoFocus
                  required
                  maxLength={80}
                  value={messName}
                  onChange={(event) => setMessName(event.target.value)}
                  placeholder="e.g. Shapla House"
                />
              </span>
            </label>
            <label>
              Location
              <span className="input-with-icon">
                <MapPin size={17} aria-hidden="true" />
                <input
                  required
                  maxLength={120}
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Area, city"
                />
              </span>
            </label>
            <label>
              How many people will live here?
              <select value={memberCount} onChange={(event) => setMemberCount(event.target.value)}>
                <option value="3">Up to 3</option>
                <option value="5">4 to 5</option>
                <option value="8">6 to 8</option>
                <option value="12">9 to 12</option>
                <option value="20">More than 12</option>
              </select>
            </label>

            <p className="create-summary">
              <Users size={17} aria-hidden="true" />
              <span>
                <strong>You will be the first manager.</strong> After setup, add your rooms and
                record the first bazar run so MessMate can work out the meal rate.
              </span>
            </p>

            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <ActionButton busy={busy} busyLabel="Creating…" className="auth-primary" type="submit">
              Create mess <ChevronRight size={17} aria-hidden="true" />
            </ActionButton>
          </form>
        </div>
      )}

      {stage === "join" && (
        <div className="auth-step join-step">
          <span className="join-key-visual" aria-hidden="true">
            <KeyRound size={27} />
          </span>
          <span className="auth-kicker">JOIN A MESS</span>
          <h1>Enter your join code.</h1>
          <p>
            Your mess manager can find it under Members. It looks like{" "}
            <strong>SHAPLA-7K4M</strong>. Entering it sends a request that a manager has to
            accept &mdash; unless they have already invited your email, in which case you go
            straight in.
          </p>
          <form className="auth-form" onSubmit={joinMess}>
            <label>
              Mess join code
              <input
                className={`code-input ${error ? "invalid" : ""}`}
                autoFocus
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                value={joinInput}
                onChange={(event) => {
                  setJoinInput(event.target.value.toUpperCase());
                  setError("");
                }}
                placeholder="ENTER-CODE"
                maxLength={20}
              />
            </label>
            {error && (
              <p className="field-error" role="alert">
                {error}
              </p>
            )}
            <ActionButton busy={busy} busyLabel="Sending…" className="auth-primary" type="submit">
              Send a join request <ChevronRight size={17} aria-hidden="true" />
            </ActionButton>
          </form>
          <p className="join-safety">
            <LockKeyhole size={18} aria-hidden="true" />
            <span>
              <strong>Only join people you know.</strong> Your name and email become visible to
              everyone in that mess.
            </span>
          </p>
        </div>
      )}

      {stage === "pending" && request && (
        <div className="auth-step pending-step">
          <span className="pending-ring" aria-hidden="true">
            <Hourglass size={28} />
          </span>
          <span className="auth-kicker">WAITING FOR APPROVAL</span>
          <h1>Your request is with {request.messName}.</h1>
          <p>
            A manager there has to accept you before you can see the mess. You will get in as soon
            as they do &mdash; there is nothing else for you to do.
          </p>

          <ol className="pending-timeline">
            <li className="done">
              <Check size={13} aria-hidden="true" /> You asked to join
            </li>
            <li className="current">
              <Hourglass size={13} aria-hidden="true" /> A manager reviews it
            </li>
            <li>
              <Users size={13} aria-hidden="true" /> They assign you a room
            </li>
          </ol>

          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          <button className="auth-primary" type="button" onClick={refresh}>
            Check again <ChevronRight size={17} aria-hidden="true" />
          </button>

          <div className="pending-actions">
            <button type="button" className="auth-secondary" disabled={busy} onClick={cancelRequest}>
              Cancel the request
            </button>
          </div>

          <SecureNote>
            In a hurry? Ask your manager to invite your email address instead &mdash; an invitation
            lets you in without waiting.
          </SecureNote>
        </div>
      )}

      {stage === "created" && (
        <div className="auth-step created-step">
          <span className="success-ring" aria-hidden="true">
            <Check size={29} />
          </span>
          <span className="auth-kicker">MESS CREATED</span>
          <h1>{messName} is ready.</h1>
          <p>Share this private code with your housemates so they can join.</p>
          <div className="created-code-card">
            <span>YOUR JOIN CODE</span>
            <strong>{createdCode}</strong>
            <CopyButton value={createdCode} />
          </div>
          <p className="code-warning">
            <LockKeyhole size={18} aria-hidden="true" />
            <span>
              <strong>Keep the code private.</strong> Anyone who has it can join. You can generate a
              new one at any time from Mess settings.
            </span>
          </p>
          <button className="auth-primary" onClick={enterWorkspace} type="button">
            Open {messName} <ArrowUpRight size={17} aria-hidden="true" />
          </button>
        </div>
      )}
    </AuthScreen>
  );
}
