/**
 * Test script to analyze AVNU integration for January 31, 2026
 * This will execute real RPC queries to gather fee data
 */

import { createRpcCaller } from './src/affiliateRevenue/utils/rpcCall'
import { estimateBlockFromTimestamp } from './src/affiliateRevenue/utils/blockEstimation'
import {
  STARKNET_RPC_URL,
  STARKNET_BLOCK_TIME_SECONDS,
  BLOCK_ESTIMATION_BUFFER,
  TRANSFER_SELECTOR,
  SHAPESHIFT_TREASURY,
  AVNU_EXCHANGE,
} from './src/affiliateRevenue/avnu/constants'
import {
  normalizeStarknetAddress,
  parseU256Amount,
  isAvnuTransfer,
  buildAssetId,
} from './src/affiliateRevenue/avnu/utils'
import type { StarknetEvent, StarknetEventsResponse, StarknetBlock } from './src/affiliateRevenue/avnu/types'

const rpcCall = createRpcCaller(STARKNET_RPC_URL, 30000)

// Jan 31, 2026 UTC
const START_TIMESTAMP = 1769817600
const END_TIMESTAMP = 1769903999

interface FeeData {
  txHash: string
  tokenAddress: string
  assetId: string
  amount: string
  blockNumber: number
  timestamp: number
}

async function getBlockTimestamp(blockNumber: number): Promise<number> {
  const block = await rpcCall<StarknetBlock>('starknet_getBlockWithTxs', [{ block_number: blockNumber }])
  return block.timestamp
}

async function fetchEventsInBlockRange(fromBlock: number, toBlock: number): Promise<StarknetEvent[]> {
  console.log(`Fetching events from block ${fromBlock} to ${toBlock}`)
  const allEvents: StarknetEvent[] = []
  let continuationToken: string | undefined

  do {
    const result = await rpcCall<StarknetEventsResponse>('starknet_getEvents', [
      {
        from_block: { block_number: fromBlock },
        to_block: { block_number: toBlock },
        address: null,
        keys: [
          [TRANSFER_SELECTOR],
          null,
          [SHAPESHIFT_TREASURY],
        ],
        chunk_size: 1000,
        continuation_token: continuationToken,
      },
    ])

    if (!result || !Array.isArray(result.events)) {
      console.error('Invalid events response structure')
      break
    }

    console.log(`  Fetched ${result.events.length} events (continuation: ${!!result.continuation_token})`)
    allEvents.push(...result.events)
    continuationToken = result.continuation_token
  } while (continuationToken)

  return allEvents
}

async function main() {
  console.log('=== AVNU Integration Analysis for January 31, 2026 ===\n')
  console.log(`Date Range: ${new Date(START_TIMESTAMP * 1000).toISOString()} to ${new Date(END_TIMESTAMP * 1000).toISOString()}`)
  console.log(`Start timestamp: ${START_TIMESTAMP}`)
  console.log(`End timestamp: ${END_TIMESTAMP}\n`)

  // Get current block and timestamp
  console.log('Fetching current block...')
  const currentBlock = await rpcCall<number>('starknet_blockNumber', [])
  const now = Math.floor(Date.now() / 1000)
  console.log(`Current block: ${currentBlock}`)
  console.log(`Current timestamp: ${now} (${new Date(now * 1000).toISOString()})\n`)

  // Estimate block range
  console.log('Estimating block range...')
  const estimatedStart = estimateBlockFromTimestamp(currentBlock, now, START_TIMESTAMP, STARKNET_BLOCK_TIME_SECONDS)
  const estimatedEnd = estimateBlockFromTimestamp(currentBlock, now, END_TIMESTAMP, STARKNET_BLOCK_TIME_SECONDS)
  const startBlock = Math.max(0, estimatedStart - BLOCK_ESTIMATION_BUFFER)
  const endBlock = Math.min(currentBlock, estimatedEnd + BLOCK_ESTIMATION_BUFFER)

  console.log(`Estimated start block: ${estimatedStart} (with buffer: ${startBlock})`)
  console.log(`Estimated end block: ${estimatedEnd} (with buffer: ${endBlock})`)
  console.log(`Buffer: ±${BLOCK_ESTIMATION_BUFFER} blocks (~5 minutes)\n`)

  // Fetch all Transfer events to treasury
  console.log('Fetching Transfer events to ShapeShift Treasury...')
  const events = await fetchEventsInBlockRange(startBlock, endBlock)
  console.log(`Total Transfer events to treasury: ${events.length}\n`)

  // Filter for AVNU-specific transfers
  console.log('Filtering for AVNU transfers...')
  const avnuEvents = events.filter(e => isAvnuTransfer(e))
  console.log(`AVNU-specific transfers: ${avnuEvents.length}\n`)

  if (avnuEvents.length === 0) {
    console.log('No AVNU transfers found for this date range.')
    return
  }

  // Get unique block numbers
  const uniqueBlocks = [...new Set(avnuEvents.map(e => e.block_number))]
  console.log(`Fetching timestamps for ${uniqueBlocks.length} unique blocks...`)

  const blockTimestamps = new Map<number, number>()
  await Promise.all(
    uniqueBlocks.map(async blockNum => {
      try {
        const timestamp = await getBlockTimestamp(blockNum)
        blockTimestamps.set(blockNum, timestamp)
      } catch (error) {
        console.error(`Failed to get timestamp for block ${blockNum}:`, error)
        // Fallback estimation
        const blockDelta = currentBlock - blockNum
        const estimatedTimestamp = now - blockDelta * STARKNET_BLOCK_TIME_SECONDS
        blockTimestamps.set(blockNum, Math.floor(estimatedTimestamp))
      }
    })
  )

  // Process events and collect fee data
  const fees: FeeData[] = []
  const tokenAmounts = new Map<string, bigint>()

  for (const event of avnuEvents) {
    const timestamp = blockTimestamps.get(event.block_number)
    if (!timestamp) continue

    // Filter by actual timestamp
    if (timestamp < START_TIMESTAMP || timestamp > END_TIMESTAMP) {
      continue
    }

    const tokenAddress = event.from_address
    const assetId = buildAssetId(tokenAddress)
    const amount = parseU256Amount(event.data[0], event.data[1])

    fees.push({
      txHash: event.transaction_hash,
      tokenAddress,
      assetId,
      amount,
      blockNumber: event.block_number,
      timestamp,
    })

    // Aggregate by token
    const current = tokenAmounts.get(tokenAddress) || 0n
    tokenAmounts.set(tokenAddress, current + BigInt(amount))
  }

  console.log(`\n=== RESULTS FOR JANUARY 31, 2026 ===\n`)
  console.log(`Total fees collected: ${fees.length}`)
  console.log(`Unique tokens: ${tokenAmounts.size}\n`)

  // Display aggregated amounts by token
  console.log('Token breakdown:')
  for (const [tokenAddress, totalAmount] of tokenAmounts.entries()) {
    const normalized = normalizeStarknetAddress(tokenAddress)
    console.log(`  ${normalized}: ${totalAmount.toString()}`)
  }

  console.log('\n=== DETAILED TRANSACTIONS ===\n')
  fees.forEach((fee, idx) => {
    console.log(`Transaction ${idx + 1}:`)
    console.log(`  Hash: ${fee.txHash}`)
    console.log(`  Token: ${normalizeStarknetAddress(fee.tokenAddress)}`)
    console.log(`  AssetId: ${fee.assetId}`)
    console.log(`  Amount: ${fee.amount}`)
    console.log(`  Block: ${fee.blockNumber}`)
    console.log(`  Timestamp: ${fee.timestamp} (${new Date(fee.timestamp * 1000).toISOString()})`)
    console.log('')
  })

  console.log('=== INTEGRATION SUMMARY ===\n')
  console.log('How AVNU integration works:')
  console.log('1. Queries Starknet RPC for Transfer events to ShapeShift treasury')
  console.log('2. Filters for transfers FROM AVNU Exchange contract')
  console.log('3. Uses block estimation based on 2.7s block time')
  console.log('4. Fetches block timestamps for precise filtering')
  console.log('5. Parses u256 amounts from event data')
  console.log('6. Enriches with USD prices via CoinGecko')
  console.log('\nKey constants:')
  console.log(`  ShapeShift Treasury: ${SHAPESHIFT_TREASURY}`)
  console.log(`  AVNU Exchange: ${AVNU_EXCHANGE}`)
  console.log(`  Transfer Selector: ${TRANSFER_SELECTOR}`)
  console.log(`  Block Time: ${STARKNET_BLOCK_TIME_SECONDS}s`)
  console.log(`  RPC URL: ${STARKNET_RPC_URL}`)
}

main().catch(console.error)
