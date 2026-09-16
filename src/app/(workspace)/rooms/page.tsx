import { permanentRedirect } from "next/navigation";

/** Rooms moved under the House section; keep old links and bookmarks working. */
export default function LegacyRoomsPage() {
  permanentRedirect("/house/rooms");
}
