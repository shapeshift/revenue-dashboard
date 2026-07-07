import { SortArrow } from './SortArrow'

// A sortable table header — click or keyboard (Enter/Space) to sort. Reserves the arrow slot so
// nothing shifts when the active column changes.
export function SortHeader<K extends string>({
  label,
  colKey,
  sortKey,
  sortDir,
  onSort,
  align = 'right',
}: {
  label: string
  colKey: K
  sortKey: K
  sortDir: 'asc' | 'desc'
  onSort: (key: K) => void
  align?: 'left' | 'right'
}) {
  const active = sortKey === colKey
  return (
    <th
      role="button"
      tabIndex={0}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`${align === 'left' ? 'text-left' : 'text-right'} py-2 font-medium cursor-pointer select-none hover:text-zinc-200 sticky top-0 bg-zinc-800`}
      onClick={() => onSort(colKey)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSort(colKey)
        }
      }}
    >
      {label}
      <SortArrow active={active} dir={sortDir} />
    </th>
  )
}
