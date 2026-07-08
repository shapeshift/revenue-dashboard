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

export function TotalVolume({ amount, isLoading }: TotalVolumeProps) {
  return (
    <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-8">
      <h2 className="text-zinc-400 text-sm font-medium uppercase tracking-wider mb-2">Volume</h2>
      {isLoading ? (
        <div className="h-12 w-48 bg-zinc-700 rounded animate-pulse" />
      ) : (
        <p className="text-4xl font-bold text-blue-400">{amount !== undefined ? formatUsd(amount) : '—'}</p>
      )}
    </div>
  )
}
