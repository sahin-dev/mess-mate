"use client";

import { Bath, MapPin, Search, SlidersHorizontal, Wind, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

/**
 * Search lives in the URL, so a result set can be shared, bookmarked, reached
 * with the back button and crawled. The form submits normally; nothing here
 * holds the listings themselves.
 */
export function ListingSearch({
  areas,
  resultCount,
  basePath = "/community",
}: {
  areas: { area: string; count: number }[];
  resultCount: number;
  /** Where the search submits to; /join reuses this while signed in. */
  basePath?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [where, setWhere] = useState(params.get("where") ?? "");
  const [showFilters, setShowFilters] = useState(
    Boolean(params.get("maxRent") || params.get("seats") || params.get("features")),
  );

  const features = new Set((params.get("features") ?? "").split(",").filter(Boolean));
  const maxRent = params.get("maxRent") ?? "";
  const seats = params.get("seats") ?? "";
  const hasFilters = Boolean(where || maxRent || seats || features.size);

  const apply = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.push(query ? `${basePath}?${query}` : basePath);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    apply({ where: where.trim() || null });
  };

  const toggleFeature = (key: string) => {
    const next = new Set(features);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply({ features: [...next].join(",") || null });
  };

  return (
    <div className="listing-search">
      <form className="search-row" onSubmit={submit} role="search">
        <label className="search-box search-main">
          <MapPin size={16} aria-hidden="true" />
          <span className="visually-hidden">Search by area, city or house</span>
          <input
            type="search"
            value={where}
            onChange={(event) => setWhere(event.target.value)}
            placeholder="Search an area, e.g. Dhanmondi"
          />
          {where && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear the search"
              onClick={() => {
                setWhere("");
                apply({ where: null });
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>
        <button type="submit" className="button button-dark">
          <Search size={16} aria-hidden="true" /> Search
        </button>
        <button
          type="button"
          className={`button button-outline ${showFilters ? "is-open" : ""}`}
          aria-expanded={showFilters}
          onClick={() => setShowFilters((value) => !value)}
        >
          <SlidersHorizontal size={16} aria-hidden="true" /> Filters
        </button>
      </form>

      {areas.length > 0 && !where && (
        <div className="area-chips">
          <span>Popular areas:</span>
          {areas.map((entry) => (
            <Link key={entry.area} href={`${basePath}?where=${encodeURIComponent(entry.area)}`}>
              {entry.area} <b>{entry.count}</b>
            </Link>
          ))}
        </div>
      )}

      {showFilters && (
        <div className="filter-row">
          <label>
            Rent up to
            <select value={maxRent} onChange={(event) => apply({ maxRent: event.target.value || null })}>
              <option value="">Any</option>
              {[4000, 6000, 8000, 10000, 15000, 20000].map((amount) => (
                <option key={amount} value={amount}>
                  &#2547;{amount.toLocaleString("en-US")}
                </option>
              ))}
            </select>
          </label>

          <label>
            Room for
            <select value={seats} onChange={(event) => apply({ seats: event.target.value || null })}>
              <option value="">Any</option>
              <option value="1">1 person or more</option>
              <option value="2">2 people or more</option>
              <option value="3">3 people or more</option>
            </select>
          </label>

          <div className="feature-filters">
            {(
              [
                ["bath", "Attached bathroom", Bath],
                ["balcony", "Balcony", MapPin],
                ["ac", "Air conditioning", Wind],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                className={features.has(key) ? "selected" : ""}
                aria-pressed={features.has(key)}
                onClick={() => toggleFeature(key)}
              >
                <Icon size={14} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="search-summary">
        <span>
          {resultCount === 0
            ? "No rooms match"
            : `${resultCount} ${resultCount === 1 ? "room" : "rooms"}`}
          {where && ` in “${where}”`}
        </span>
        {hasFilters && (
          <Link className="text-button" href={basePath}>
            <X size={13} aria-hidden="true" /> Clear all
          </Link>
        )}
      </div>
    </div>
  );
}
