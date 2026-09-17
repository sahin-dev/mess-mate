"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { MAX_RULES, RULE_SUGGESTIONS } from "@/lib/listing-post";
import type { HouseRule } from "@/lib/types";

/**
 * House rules, written as sentences.
 *
 * The suggestions matter more than they look: people find it far easier to
 * adjust a sentence than to invent one, and the examples set the tone by
 * saying what the rule is *and* why it exists.
 */
export function ListingRules({
  rules,
  onChange,
}: {
  rules: HouseRule[];
  onChange: (rules: HouseRule[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const full = rules.length >= MAX_RULES;

  const add = (text: string) => {
    const clean = text.trim();
    if (!clean || full) return;
    if (rules.some((rule) => rule.text.toLowerCase() === clean.toLowerCase())) return;
    onChange([...rules, { id: `rule-${Date.now()}-${rules.length}`, text: clean }]);
    setDraft("");
  };

  const unused = RULE_SUGGESTIONS.filter(
    (suggestion) => !rules.some((rule) => rule.text === suggestion),
  ).slice(0, 5);

  return (
    <div className="rules-editor">
      <div className="photo-editor-head">
        <strong>House rules</strong>
        <span>
          The things that actually cause friction. Say why, and it reads as fair rather than fussy.
        </span>
      </div>

      {rules.length > 0 && (
        <ul className="rules-list">
          {rules.map((rule) => (
            <li key={rule.id}>
              <span>{rule.text}</span>
              <button
                type="button"
                aria-label={`Remove rule: ${rule.text}`}
                onClick={() => onChange(rules.filter((item) => item.id !== rule.id))}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <>
          <div className="rule-add">
            <input
              value={draft}
              maxLength={180}
              placeholder="e.g. Lights off by midnight — the room is shared."
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter adds the rule; it must not submit the whole post.
                if (event.key === "Enter") {
                  event.preventDefault();
                  add(draft);
                }
              }}
            />
            <button
              type="button"
              className="button button-outline button-tiny"
              disabled={!draft.trim()}
              onClick={() => add(draft)}
            >
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          </div>

          {unused.length > 0 && (
            <div className="rule-suggestions">
              <span>Common ones:</span>
              {unused.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => add(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
