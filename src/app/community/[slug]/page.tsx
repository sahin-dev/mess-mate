import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Car,
  Check,
  Mail,
  MapPin,
  MoveVertical,
  Phone,
  TriangleAlert,
} from "lucide-react";
import { formatDate, formatMoney, pluralize } from "@/lib/format";
import { getDb } from "@/lib/mongodb";
import { FURNISHING_LABEL, PARKING_LABEL, propertySummary, roomHighlights } from "@/lib/property";
import { loadPublishedListing, type PublicListing } from "@/lib/public-listings";
import { MapView } from "@/components/map-picker";

export const revalidate = 300;

async function getListing(slug: string) {
  try {
    return await loadPublishedListing(await getDb(), slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListing(slug);
  if (!listing) return { title: "Room not found", robots: { index: false, follow: false } };

  const where = [listing.property.area, listing.property.city].filter(Boolean).join(", ");
  const title = `${listing.room.name} in ${listing.messName}${where ? `, ${where}` : ""}`;
  const description = `${pluralize(listing.seats, "space")} at ${formatMoney(
    listing.rentPerSeat,
  )} rent per person. About ${formatMoney(listing.costs.estimatedMonthlyTotal)} a month all in, including food and bills.`;

  return {
    title,
    description,
    alternates: { canonical: `/community/${slug}` },
    openGraph: { title: `${title} | MessMate`, description, type: "article" },
  };
}

export default async function ListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await getListing(slug);
  if (!listing) notFound();

  const { property, room } = listing;
  const where = [property.area, property.city].filter(Boolean).join(", ");

  return (
    <div className="public-page listing-detail">
      <Link className="auth-back" href="/community">
        <ArrowLeft size={16} aria-hidden="true" /> All rooms
      </Link>

      <header className="listing-header">
        <div>
          <h1>
            {room.name} in {listing.messName}
          </h1>
          <p className="listing-where">
            <MapPin size={15} aria-hidden="true" />
            {propertySummary(property) || where || "Location not given"}
          </p>
        </div>
        <div className="listing-price">
          <strong>{formatMoney(listing.rentPerSeat)}</strong>
          <small>rent per person, per month</small>
        </div>
      </header>

      <div className="listing-layout">
        <div className="listing-body">
          <section className="panel listing-section">
            <h2>The room</h2>
            <ul className="facility-chips">
              {roomHighlights(room).map((feature) => (
                <li key={feature}>
                  <Check size={13} aria-hidden="true" />
                  <span>
                    <strong>{feature}</strong>
                  </span>
                </li>
              ))}
            </ul>
            <dl className="listing-facts">
              <div>
                <dt>Letting to</dt>
                <dd>{pluralize(listing.seats, "person", "people")}</dd>
              </div>
              <div>
                <dt>Room type</dt>
                <dd>{room.type}</dd>
              </div>
              <div>
                <dt>Furnishing</dt>
                <dd>{FURNISHING_LABEL[room.furnishing]}</dd>
              </div>
              <div>
                <dt>Available from</dt>
                <dd>{formatDate(listing.availableFrom)}</dd>
              </div>
            </dl>
            {room.notes && <p className="listing-notes">{room.notes}</p>}
            {listing.description && <p className="listing-description">{listing.description}</p>}
          </section>

          <CostSection listing={listing} />

          <section className="panel listing-section">
            <h2>The building</h2>
            <dl className="listing-facts">
              <div>
                <dt>
                  <MoveVertical size={13} aria-hidden="true" /> Floor
                </dt>
                <dd>{property.floor || "Not given"}</dd>
              </div>
              <div>
                <dt>
                  <Building2 size={13} aria-hidden="true" /> Flat
                </dt>
                <dd>{property.flatNumber || "Not given"}</dd>
              </div>
              <div>
                <dt>Lift</dt>
                <dd>{property.hasLift ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>
                  <Car size={13} aria-hidden="true" /> Parking
                </dt>
                <dd>
                  {property.parking.available
                    ? `${PARKING_LABEL[property.parking.type]}${
                        property.parking.spots ? `, ${pluralize(property.parking.spots, "space")}` : ""
                      }${
                        property.parking.monthlyCost > 0
                          ? ` · ${formatMoney(property.parking.monthlyCost)}/month`
                          : " · included"
                      }`
                    : "None"}
                </dd>
              </div>
            </dl>
            {property.parking.available && property.parking.procedure && (
              <p className="listing-notes">
                <strong>Getting a space:</strong> {property.parking.procedure}
              </p>
            )}
            {property.notes && <p className="listing-notes">{property.notes}</p>}
          </section>

          {listing.facilities.length > 0 && (
            <section className="panel listing-section">
              <h2>What the house has</h2>
              <ul className="facility-chips">
                {listing.facilities.map((facility) => (
                  <li key={facility.id}>
                    <Check size={13} aria-hidden="true" />
                    <span>
                      <strong>{facility.label}</strong>
                      {facility.detail && <small>{facility.detail}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {property.coordinates && (
            <section className="panel listing-section">
              <h2>Where it is</h2>
              <MapView point={property.coordinates} label={listing.messName} />
            </section>
          )}
        </div>

        <aside className="listing-aside">
          <section className="panel listing-contact">
            <h2>Get in touch</h2>
            <p className="listing-contact-name">{listing.contactName}</p>
            {listing.contactPhone && (
              <a className="button button-dark" href={`tel:${listing.contactPhone.replace(/\s/g, "")}`}>
                <Phone size={15} aria-hidden="true" /> {listing.contactPhone}
              </a>
            )}
            {listing.contactEmail && (
              <a className="button button-outline" href={`mailto:${listing.contactEmail}`}>
                <Mail size={15} aria-hidden="true" /> Email
              </a>
            )}
            <p className="listing-caution">
              <TriangleAlert size={14} aria-hidden="true" />
              Visit in person before you pay anything. MessMate does not verify listings or handle
              money.
            </p>
            {listing.publishedAt && (
              <p className="listing-published">Listed {formatDate(listing.publishedAt.slice(0, 10))}</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function CostSection({ listing }: { listing: PublicListing }) {
  const { costs } = listing;
  return (
    <section className="panel listing-section cost-section">
      <h2>What it really costs</h2>
      {costs.period ? (
        <p className="cost-basis">
          From this house&rsquo;s own records for {costs.periodLabel}, shared between{" "}
          {pluralize(costs.memberCount, "person", "people")}.
        </p>
      ) : (
        <p className="cost-basis">
          This house has not recorded a full month yet, so only the rent is shown.
        </p>
      )}

      <ul className="cost-breakdown">
        {costs.breakdown.map((row) => (
          <li key={row.label}>
            <span>
              <strong>{row.label}</strong>
              <small>{row.note}</small>
            </span>
            <b>{formatMoney(row.amount)}</b>
          </li>
        ))}
      </ul>

      <div className="cost-total">
        <span>About what one person pays each month</span>
        <strong>{formatMoney(costs.estimatedMonthlyTotal)}</strong>
      </div>

      {costs.mealRate > 0 && (
        <p className="cost-footnote">
          The food figure is the real meal rate of {formatMoney(costs.mealRate, { decimals: true })}{" "}
          per meal, times the {costs.averageMealsPerMember} meals an average member ate that month.
          Eat less and you pay less.
        </p>
      )}
    </section>
  );
}
