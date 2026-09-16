"use client";

import { Crosshair, MapPin, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";

/**
 * Location picker built on Leaflet and OpenStreetMap tiles.
 *
 * Leaflet is loaded from the npm package at interaction time rather than from a
 * CDN, so the content security policy needs no third-party script host — only
 * the tile images.
 */

export type MapPoint = { lat: number; lng: number };

export type GeocodeResult = {
  label: string;
  lat: number;
  lng: number;
  area: string;
  city: string;
  postcode: string;
};

const DEFAULT_CENTRE: MapPoint = { lat: 23.7509, lng: 90.3891 }; // Dhaka

/**
 * Leaflet builds its default marker's `src` by sniffing the URL of its own
 * stylesheet, which a bundler defeats: the path collapses to a bare
 * "marker-icon.png" that 404s against the site root, and the pin renders as a
 * broken image. Drawing our own marker sidesteps that entirely, needs no image
 * asset, stays crisp on any screen and matches the rest of the app.
 */
const MARKER_SVG = `
<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Location">
  <path d="M15 0C6.72 0 0 6.72 0 15c0 10.5 13.4 25.6 13.97 26.24a1.37 1.37 0 0 0 2.06 0C16.6 40.6 30 25.5 30 15 30 6.72 23.28 0 15 0z" fill="#c9603f"/>
  <circle cx="15" cy="15" r="5.6" fill="#ffffff"/>
</svg>`;

function messMarker(leaflet: typeof import("leaflet")) {
  return leaflet.divIcon({
    html: MARKER_SVG,
    // An empty class name drops Leaflet's default white box around div icons.
    className: "mess-marker",
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -38],
  });
}

export function MapPicker({
  value,
  onChange,
  onPlaceChosen,
  height = 320,
}: {
  value: MapPoint | null;
  onChange: (point: MapPoint | null) => void;
  /** Fired when a search result is picked, so the address fields can follow. */
  onPlaceChosen?: (result: GeocodeResult) => void;
  height?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  // Kept current in an effect so the map's own listeners always call the latest
  // handler without the map having to be rebuilt.
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let instance: LeafletMap | null = null;

    (async () => {
      try {
        const leaflet = await import("leaflet");
        if (cancelled || !container.current) return;

        instance = leaflet.map(container.current, {
          center: value ?? DEFAULT_CENTRE,
          zoom: value ? 17 : 12,
          // Scroll should scroll the page; the map zooms on its own buttons.
          scrollWheelZoom: false,
        });
        leaflet
          .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors",
          })
          .addTo(instance);

        const place = (point: MapPoint) => {
          if (!instance) return;
          if (marker.current) {
            marker.current.setLatLng(point);
          } else {
            marker.current = leaflet
              .marker(point, { draggable: true, icon: messMarker(leaflet) })
              .addTo(instance)
              .on("dragend", () => {
                const position = marker.current?.getLatLng();
                if (position) onChangeRef.current({ lat: position.lat, lng: position.lng });
              });
          }
        };

        if (value) place(value);
        instance.on("click", (event) => {
          place(event.latlng);
          onChangeRef.current({ lat: event.latlng.lat, lng: event.latlng.lng });
        });

        map.current = instance;
        setReady(true);
        // The container is often measured before it is visible, which leaves
        // the tiles grey until the map is told to re-measure.
        setTimeout(() => instance?.invalidateSize(), 120);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      instance?.remove();
      map.current = null;
      marker.current = null;
    };
    // Built once; later value changes are pushed in by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the value when it is changed from outside, e.g. by a search result.
  useEffect(() => {
    if (!ready || !map.current || !value) return;
    map.current.setView(value, Math.max(map.current.getZoom(), 16));
    if (marker.current) marker.current.setLatLng(value);
  }, [ready, value]);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    setSearchError("");
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const payload = (await response.json()) as { results?: GeocodeResult[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Search failed.");
      setResults(payload.results ?? []);
      if (!payload.results?.length) setSearchError("Nothing found. Try a landmark, or drop the pin.");
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const choose = (result: GeocodeResult) => {
    onChange({ lat: result.lat, lng: result.lng });
    onPlaceChosen?.(result);
    setResults([]);
    setQuery(result.label.split(",").slice(0, 2).join(", "));
  };

  if (failed) {
    return (
      <div className="map-fallback">
        <MapPin size={20} aria-hidden="true" />
        <p>
          The map could not load. You can still type coordinates below, or leave them empty.
        </p>
      </div>
    );
  }

  return (
    <div className="map-picker">
      <form className="map-search" onSubmit={search} role="search">
        <label className="search-box">
          <Search size={15} aria-hidden="true" />
          <span className="visually-hidden">Search for the building</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search an address or landmark"
          />
        </label>
        <button type="submit" className="button button-outline" disabled={searching || query.trim().length < 3}>
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {searchError && <p className="field-error">{searchError}</p>}

      {results.length > 0 && (
        <ul className="map-results">
          {results.map((result) => (
            <li key={`${result.lat},${result.lng}`}>
              <button type="button" onClick={() => choose(result)}>
                <MapPin size={14} aria-hidden="true" />
                <span>{result.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="map-canvas" style={{ height }} ref={container} />

      <div className="map-footer">
        <span>
          {value ? (
            <>
              <Crosshair size={13} aria-hidden="true" /> Pin at {value.lat.toFixed(5)},{" "}
              {value.lng.toFixed(5)}
            </>
          ) : (
            "Click the map, or search above, to drop a pin."
          )}
        </span>
        {value && (
          <button type="button" className="text-button" onClick={() => onChange(null)}>
            <X size={13} aria-hidden="true" /> Remove pin
          </button>
        )}
      </div>
    </div>
  );
}

/** Read-only map for the public listing page. */
export function MapView({ point, label, height = 280 }: { point: MapPoint; label: string; height?: number }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let instance: LeafletMap | null = null;

    (async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !container.current) return;
      instance = leaflet.map(container.current, {
        center: point,
        zoom: 16,
        scrollWheelZoom: false,
      });
      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        })
        .addTo(instance);
      leaflet.marker(point, { icon: messMarker(leaflet) }).addTo(instance).bindPopup(label);
      setTimeout(() => instance?.invalidateSize(), 120);
    })();

    return () => {
      cancelled = true;
      instance?.remove();
    };
  }, [point, label]);

  return <div className="map-canvas" style={{ height }} ref={container} />;
}
