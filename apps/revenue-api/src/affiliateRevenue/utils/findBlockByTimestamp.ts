// Last block at or before the timestamp (the head when the timestamp is ahead of the chain). Interpolating on
// block time lands within a few blocks, so a lookup takes a handful of headers rather than log2(height)
export const findBlockByTimestamp = async (
  getBlockTimestamp: (block: number) => Promise<number>,
  latestBlock: number,
  timestamp: number
): Promise<number> => {
  let high = latestBlock
  let highTimestamp = await getBlockTimestamp(high)
  if (highTimestamp <= timestamp) return high

  let low = 0
  let lowTimestamp = await getBlockTimestamp(low)
  if (lowTimestamp > timestamp) return low

  // Invariant: lowTimestamp <= timestamp < highTimestamp
  let bisect = false
  while (high - low > 1) {
    const width = high - low
    const fraction = bisect ? 0.5 : (timestamp - lowTimestamp) / (highTimestamp - lowTimestamp)
    const mid = Math.min(Math.max(low + Math.floor(width * fraction), low + 1), high - 1)
    const midTimestamp = await getBlockTimestamp(mid)

    if (midTimestamp <= timestamp) {
      low = mid
      lowTimestamp = midTimestamp
    } else {
      high = mid
      highTimestamp = midTimestamp
    }

    // Bisect once after an interpolation that failed to halve the bracket, so uneven block times stay logarithmic
    bisect = !bisect && high - low > width / 2
  }

  return low
}
