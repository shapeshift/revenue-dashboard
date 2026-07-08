// Sort indicator that always reserves space (no layout shift): muted ↕ when inactive, ↑/↓ when active.
export function SortArrow({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span className={`ml-1 inline-block w-3 text-center ${active ? 'text-zinc-200' : 'text-zinc-600'}`}>
      {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
    </span>
  )
}
