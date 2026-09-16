import { clientKey, rateLimit } from "@/lib/rate-limit";
import { ApiError, jsonError, requireWorkspace } from "@/lib/server-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Address search for the map picker.
 *
 * Proxied rather than called from the browser for three reasons: Nominatim's
 * usage policy requires an identifying User-Agent, it asks for no more than one
 * request per second, and going through the server keeps the content security
 * policy free of a third-party `connect-src`.
 */
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

export async function GET(request: Request) {
  try {
    // Only signed-in managers use this, which also bounds the traffic we send on.
    await requireWorkspace();

    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 3) {
      return Response.json({ results: [] });
    }

    const limit = rateLimit(`geocode:${clientKey(request)}`, 30, 60_000);
    if (!limit.ok) {
      throw new ApiError(429, "Too many searches. Wait a moment and try again.", {
        "Retry-After": String(limit.retryAfter),
      });
    }

    const url = new URL(NOMINATIM);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "6");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url, {
      headers: {
        // Nominatim blocks callers that do not identify themselves.
        "User-Agent": `MessMate/1.0 (${process.env.MESSMATE_APP_URL ?? "self-hosted"})`,
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new ApiError(502, "The address service did not respond. Drop the pin by hand instead.");
    }

    const payload = (await response.json()) as {
      lat: string;
      lon: string;
      display_name: string;
      address?: Record<string, string>;
    }[];

    return Response.json({
      results: payload.map((item) => ({
        label: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon),
        area:
          item.address?.suburb ??
          item.address?.neighbourhood ??
          item.address?.city_district ??
          item.address?.village ??
          "",
        city: item.address?.city ?? item.address?.town ?? item.address?.state_district ?? "",
        postcode: item.address?.postcode ?? "",
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return Response.json(
        { error: "The address service timed out. Drop the pin by hand instead." },
        { status: 504 },
      );
    }
    return jsonError(error);
  }
}
