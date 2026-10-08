export function TerritorialRouteLoading() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[#f7f5f0] text-[#727d91]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-territorial-loading=""
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-[#e4dfd4] border-t-[#1a2130]"
        aria-hidden
      />
      <p className="text-sm">Carregando território</p>
    </div>
  )
}
