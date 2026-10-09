export function TerritorialBrand() {
  return (
    <div className="territorial-brand-mark flex min-w-0 items-center gap-3.5" data-territorial-brand="">
      <img src="/estudio_logo.png" alt="" className="h-12 w-12 shrink-0 rounded-xl" aria-hidden />
      <div className="flex min-w-0 items-center gap-x-3">
        <p className="text-[15px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#1a2130]">
          Plataforma
          <br />
          Becker
        </p>
        <p className="whitespace-nowrap text-sm font-medium leading-none text-[#5d6678]">
          powered by vonturing.tech
        </p>
      </div>
    </div>
  )
}
