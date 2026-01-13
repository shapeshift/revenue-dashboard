import { Tooltip } from './Tooltip'

type TotalVolumeProps = {
  amount: number | undefined
  isLoading: boolean
}

const formatUsd = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)

const InfoIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="inline-block ml-1.5"
  >
    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 7.5V11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="5" r="0.75" fill="currentColor" />
  </svg>
)

export function TotalVolume({ amount, isLoading }: TotalVolumeProps) {
  return (
    <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-8">
      <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-2">
        Volume
        <Tooltip content="Revenue generating volume calculated from affiliate fees (revenue ÷ 0.55%)">
          <InfoIcon />
        </Tooltip>
      </h2>
      {isLoading ? (
        <div className="h-12 w-48 bg-zinc-700 rounded animate-pulse" />
      ) : (
        <p className="text-4xl font-bold text-blue-400">{amount !== undefined ? formatUsd(amount) : '—'}</p>
      )}
    </div>
  )
}
