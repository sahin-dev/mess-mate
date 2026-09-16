import Link from "next/link";
import { Bath, Home, MapPin, Wind } from "lucide-react";
import { formatDate, formatMoney, pluralize } from "@/lib/format";
import type { PublicListingCard } from "@/lib/public-listings";

/** One room in the browse grid. Used by the landing page, /community and /join. */
export function ListingCard({ listing }: { listing: PublicListingCard }) {
  return (
    <Link className="listing-card" href={`/community/${listing.slug}`}>
      <div className="listing-card-head">
        <strong>{listing.messName}</strong>
        <span>
          <MapPin size={13} aria-hidden="true" />
          {[listing.area, listing.city].filter(Boolean).join(", ") || "Location not given"}
        </span>
      </div>

      <p className="listing-room">
        {listing.roomName} &middot; {listing.roomType} &middot;{" "}
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

      <small className="listing-available">Available from {formatDate(listing.availableFrom)}</small>
    </Link>
  );
}
