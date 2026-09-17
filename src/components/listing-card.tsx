import Link from "next/link";
import { Bath, Camera, Home, MapPin, ScrollText, Wind } from "lucide-react";
import { formatDate, formatMoney, pluralize } from "@/lib/format";
import { photoUrl } from "@/lib/listing-post";
import type { PublicListingCard } from "@/lib/public-listings";

/** One room in the browse grid. Used by the landing page, /community and /join. */
export function ListingCard({ listing }: { listing: PublicListingCard }) {
  return (
    <Link className="listing-card" href={`/community/${listing.slug}`}>
      {listing.coverPhotoId ? (
        <div className="listing-cover">
          {/* eslint-disable-next-line @next/next/no-img-element -- served from
              our own route at a fixed display size, already downscaled. */}
          <img src={photoUrl(listing.coverPhotoId)} alt="" loading="lazy" />
          {listing.photoCount > 1 && (
            <span className="listing-photo-count">
              <Camera size={12} aria-hidden="true" /> {listing.photoCount}
            </span>
          )}
        </div>
      ) : (
        <div className="listing-cover listing-cover-empty" aria-hidden="true">
          <Home size={22} />
        </div>
      )}

      <div className="listing-card-head">
        <strong>{listing.title}</strong>
        <span>
          <MapPin size={13} aria-hidden="true" />
          {[listing.area, listing.city].filter(Boolean).join(", ") || "Location not given"}
        </span>
      </div>

      <p className="listing-room">
        {listing.messName} &middot; {listing.roomType} &middot;{" "}
        {pluralize(listing.seats, "person", "people")}
      </p>

      <ul className="listing-badges">
        {listing.attachedBathroom && (
          <li>
            <Bath size={12} aria-hidden="true" /> Attached bath
          </li>
        )}
        {listing.balcony && (
          <li>
            <Home size={12} aria-hidden="true" /> Balcony
          </li>
        )}
        {listing.airConditioned && (
          <li>
            <Wind size={12} aria-hidden="true" /> AC
          </li>
        )}
        {listing.facilityCount > 0 && <li>{listing.facilityCount} facilities</li>}
      </ul>

      {listing.statedPreferences.length > 0 && (
        <ul className="listing-prefs">
          {listing.statedPreferences.slice(0, 3).map((preference) => (
            <li key={preference.label}>{preference.value}</li>
          ))}
        </ul>
      )}

      <div className="listing-card-foot">
        <div>
          <strong>{formatMoney(listing.rentPerSeat)}</strong>
          <small>rent per person</small>
        </div>
        <div className="listing-total">
          <strong>{formatMoney(listing.estimatedMonthlyTotal)}</strong>
          <small>all in, per month</small>
        </div>
      </div>

      <small className="listing-available">
        Available from {formatDate(listing.availableFrom)}
        {listing.ruleCount > 0 && (
          <>
            {" "}
            &middot; <ScrollText size={11} aria-hidden="true" />{" "}
            {pluralize(listing.ruleCount, "house rule")}
          </>
        )}
      </small>
    </Link>
  );
}
