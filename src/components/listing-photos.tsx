"use client";

import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { MAX_PHOTOS, photoUrl } from "@/lib/listing-post";
import type { ListingPhoto } from "@/lib/types";
import { useWorkspace } from "@/components/workspace-context";

/** The long edge a stored photo is reduced to. Plenty for a full-width view. */
const MAX_EDGE = 1600;
const QUALITY = 0.82;

/**
 * Shrinks a photo in the browser before it is uploaded.
 *
 * A modern phone camera produces 4-12 MB per shot, which is far more detail
 * than a room photo on a listing needs, and would be slow to send on the mobile
 * connections most people post from. Resizing here keeps the upload small and
 * means the server never has to decode anything large.
 */
async function downscale(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot resize images.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // JPEG throughout: a room photo gains nothing from PNG and costs far more.
  return { dataUrl: canvas.toDataURL("image/jpeg", QUALITY), width, height };
}

export function ListingPhotos({ listingId, photos }: { listingId: string; photos: ListingPhoto[] }) {
  const { runAction, notify } = useWorkspace();
  const [working, setWorking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const room = MAX_PHOTOS - photos.length;

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setWorking(true);
    try {
      // One at a time, so a failure halfway leaves the earlier ones saved.
      for (const file of Array.from(files).slice(0, room)) {
        if (!file.type.startsWith("image/")) {
          notify(`${file.name} is not an image.`, "error");
          continue;
        }
        const { dataUrl, width, height } = await downscale(file);
        await runAction("addListingPhoto", { id: listingId, data: dataUrl, width, height });
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "That photo could not be added.", "error");
    } finally {
      setWorking(false);
      // Clearing lets the same file be picked again after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="photo-editor">
      <div className="photo-editor-head">
        <strong>Photos</strong>
        <span>
          {photos.length
            ? `${photos.length} of ${MAX_PHOTOS} · the first one is the cover`
            : "People skip listings with no photos. Add two or three."}
        </span>
      </div>

      <ul className="photo-strip">
        {photos.map((photo, index) => (
          <li key={photo.id}>
            {/* eslint-disable-next-line @next/next/no-img-element -- served from
                our own route, already downscaled, and sized by CSS. */}
            <img src={photoUrl(photo.id)} alt={photo.caption || `Room photo ${index + 1}`} />
            {index === 0 && (
              <span className="photo-cover" title="Cover photo">
                <Star size={11} aria-hidden="true" /> Cover
              </span>
            )}
            <button
              type="button"
              className="photo-remove"
              aria-label={`Remove photo ${index + 1}`}
              disabled={working}
              onClick={() => runAction("removeListingPhoto", { id: listingId, photoId: photo.id })}
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </li>
        ))}

        {room > 0 && (
          <li className="photo-add">
            <button type="button" disabled={working} onClick={() => inputRef.current?.click()}>
              {working ? (
                <Loader2 size={20} className="spin" aria-hidden="true" />
              ) : (
                <ImagePlus size={20} aria-hidden="true" />
              )}
              <span>{working ? "Adding…" : "Add photos"}</span>
            </button>
          </li>
        )}
      </ul>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => add(event.target.files)}
      />
    </div>
  );
}
