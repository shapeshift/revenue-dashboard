/**
 * Estimates a block number from a timestamp using average block time
 *
 * @param currentBlock Current blockchain block number
 * @param currentTimestamp Current timestamp in seconds
 * @param targetTimestamp Target timestamp to estimate block for (seconds)
 * @param blockTimeSeconds Average seconds per block for this chain
 * @returns Estimated block number (clamped to 0...currentBlock)
 */
export const estimateBlockFromTimestamp = (
  currentBlock: number,
  currentTimestamp: number,
  targetTimestamp: number,
  blockTimeSeconds: number
): number => {
  const blocksAgo = Math.floor((currentTimestamp - targetTimestamp) / blockTimeSeconds)
  const estimatedBlock = currentBlock - blocksAgo
  return Math.max(0, Math.min(estimatedBlock, currentBlock))
}
