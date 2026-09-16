export default function Loading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading-bar" />
      <span className="visually-hidden">Loading</span>
    </div>
  );
}
