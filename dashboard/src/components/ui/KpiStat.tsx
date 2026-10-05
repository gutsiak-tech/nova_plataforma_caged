import type { LucideIcon } from 'lucide-react'
import { Scale, UserMinus, UserPlus } from 'lucide-react'
import { formatInt } from '../../lib/format'
import { theme } from '../../lib/theme'
import { chartTheme } from '../../lib/chartTheme'
import { tokens } from '../../lib/tokens'
import { DecorativeSparkline } from './DecorativeSparkline'

const movementPalette = chartTheme.palette.movement

const KPI_ICONS = {
  blue: UserPlus,
  purple: UserMinus,
  green: Scale,
} as const

type KpiAccentKey = keyof typeof theme.kpiAccents

export function KpiStat({
  label,
  value,
  prevValue,
  hint,
  tone = 'neutral',
  variant = 'default',
  valueToneFromDelta = false,
  executiveAccent,
  previousLabel,
}: {
  label: string
  value: unknown
  prevValue?: unknown
  hint?: string
  tone?: 'neutral' | 'positive' | 'negative'
  variant?: 'default' | 'emphasized' | 'executive'
  valueToneFromDelta?: boolean
  executiveAccent?: KpiAccentKey
  previousLabel?: string
}) {
  const isExecutive = variant === 'executive'
  const isEmphasized = variant === 'emphasized' || isExecutive
  const currentNum = Number(value)
  const prevNum = prevValue === undefined ? null : Number(prevValue)
  const canDelta =
    prevValue !== undefined &&
    Number.isFinite(currentNum) &&
    prevNum !== null &&
    Number.isFinite(prevNum)

  let deltaSign: 'pos' | 'neg' | 'neu' | null = null
  if (canDelta) {
    const deltaAbs = currentNum - (prevNum as number)
    deltaSign = deltaAbs > 0 ? 'pos' : deltaAbs < 0 ? 'neg' : 'neu'
  }

  const effectiveTone =
    valueToneFromDelta && deltaSign
      ? deltaSign === 'pos'
        ? 'positive'
        : deltaSign === 'neg'
          ? 'negative'
          : 'neutral'
      : tone

  const toneCls =
    effectiveTone === 'positive'
      ? isEmphasized
        ? theme.kpiTile.emphasizedTonePositive
        : theme.kpiTile.tonePositive
      : effectiveTone === 'negative'
        ? isEmphasized
          ? theme.kpiTile.emphasizedToneNegative
          : theme.kpiTile.toneNegative
        : isEmphasized
          ? theme.kpiTile.emphasizedToneNeutral
          : theme.kpiTile.toneNeutral

  let deltaLine: { text: string; color: string } | null = null
  if (canDelta && deltaSign) {
    const deltaAbs = currentNum - (prevNum as number)
    const arrow = deltaSign === 'pos' ? '▲' : deltaSign === 'neg' ? '▼' : '•'

    const pct =
      prevNum === 0 ? null : (deltaAbs / (prevNum as number)) * 100
    const pctText =
      pct === null || !Number.isFinite(pct)
        ? null
        : `${pct > 0 ? '+' : pct < 0 ? '' : ''}${pct.toFixed(1).replace('.', ',')}%`

    const absText = formatInt(deltaAbs)
    const combined = pctText ? `${arrow} ${pctText} · ${absText}` : `${arrow} ${absText}`

    const color = isExecutive || isEmphasized
      ? deltaSign === 'pos'
        ? tokens.colors.semantic.positive
        : deltaSign === 'neg'
          ? tokens.colors.semantic.negative
          : tokens.colors.semantic.neutral
      : deltaSign === 'pos'
        ? movementPalette.balancePositive
        : deltaSign === 'neg'
          ? movementPalette.balanceNegative
          : chartTheme.palette.neutral.axis

    deltaLine = { text: combined, color }
  }

  const accentStyles = executiveAccent ? theme.kpiAccents[executiveAccent] : null
  const AccentIcon: LucideIcon | null = executiveAccent ? KPI_ICONS[executiveAccent] : null
  const sparkTrend =
    deltaSign === 'pos' ? 'up' : deltaSign === 'neg' ? 'down' : 'flat'

  const surfaceClass = isExecutive
    ? theme.kpiTile.executiveBaseClass
    : isEmphasized
      ? theme.kpiTile.emphasizedBaseClass
      : theme.kpiTile.baseClass

  const labelClass = isExecutive
    ? theme.kpiTile.executiveLabelClass
    : isEmphasized
      ? theme.kpiTile.emphasizedLabelClass
      : theme.kpiTile.labelClass

  return (
    <div className={surfaceClass}>
      {isExecutive && accentStyles ? (
        <>
          <div className="shrink-0">
            <div
              className={[
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1',
                accentStyles.iconBg,
              ].join(' ')}
            >
              {AccentIcon ? (
                <AccentIcon className={`h-[1.125rem] w-[1.125rem] ${accentStyles.iconColor}`} aria-hidden />
              ) : null}
            </div>
          </div>
          <p className={labelClass}>{label}</p>
          <div className={theme.kpiTile.executiveBodyClass}>
            <div className={theme.kpiTile.executiveValueSlotClass}>
              <p
                className={[theme.kpiTile.executiveValueClass, toneCls].join(' ')}
                aria-label={`${label}: ${formatInt(value)}`}
              >
                {formatInt(value)}
              </p>
            </div>
            <div className={theme.kpiTile.executiveDeltaSlotClass}>
              {deltaLine ? (
                <p
                  className={theme.kpiTile.executiveDeltaClass}
                  style={{ color: deltaLine.color }}
                >
                  <span className="sr-only">Variação em relação à competência anterior: </span>
                  {deltaLine.text}
                </p>
              ) : null}
            </div>
            <div className={theme.kpiTile.executiveVsSlotClass}>
              {previousLabel ? (
                <p className={theme.kpiTile.executiveVsClass}>vs. {previousLabel}</p>
              ) : null}
            </div>
          </div>
          <div className={theme.kpiTile.executiveSparklineClass} aria-hidden>
            <DecorativeSparkline
              color={accentStyles.spark}
              trend={sparkTrend}
              className="block h-full w-full"
            />
          </div>
        </>
      ) : (
        <>
          <p className={labelClass}>{label}</p>
          <p
            className={[theme.kpiTile.valueClass, toneCls].join(' ')}
            aria-label={`${label}: ${formatInt(value)}`}
          >
            {formatInt(value)}
          </p>
          {deltaLine ? (
            <p
              className={
                isEmphasized ? theme.kpiTile.emphasizedHintClass : theme.kpiTile.hintClass
              }
              style={{ color: deltaLine.color }}
            >
              <span className="sr-only">Variação em relação à competência anterior: </span>
              {deltaLine.text}
            </p>
          ) : hint ? (
            <p
              className={
                isEmphasized ? theme.kpiTile.emphasizedHintClass : theme.kpiTile.hintClass
              }
            >
              {hint}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
