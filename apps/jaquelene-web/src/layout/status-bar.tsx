export function StatusBar() {
  return (
    <footer
      aria-label="Status bar"
      className="col-span-2 flex min-w-0 items-center justify-end px-3 text-xs text-muted"
    >
      <span role="status">Ready</span>
    </footer>
  );
}
