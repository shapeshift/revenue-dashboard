import { Tooltip } from './Tooltip'

type TotalFeesProps = {
  count: number | undefined
  isLoading: boolean
}

const formatNumber = (count: number) => count.toLocaleString('en-US')

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

export function TotalFees({ count, isLoading }: TotalFeesProps) {
  return (
    <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-8">
      <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-2">
        Fees
        <Tooltip content="Total number of affiliate fees collected during this period">
          <InfoIcon />
        </Tooltip>
      </h2>
      {isLoading ? (
        <div className="h-12 w-48 bg-zinc-700 rounded animate-pulse" />
      ) : (
        <p className="text-4xl font-bold text-emerald-400">{count !== undefined ? formatNumber(count) : '—'}</p>
      )}
    </div>
  )
}
