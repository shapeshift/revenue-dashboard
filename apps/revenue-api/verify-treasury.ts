/**
 * Verify if there are any transfers to the treasury at all
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
import { normalizeStarknetAddress } from './src/affiliateRevenue/avnu/utils'
import type { StarknetEventsResponse, StarknetEvent } from './src/affiliateRevenue/avnu/types'

const rpcCall = createRpcCaller(STARKNET_RPC_URL, 30000)

// Jan 31, 2026
const START_TIMESTAMP = 1769817600
const END_TIMESTAMP = 1769903999

async function main() {
  console.log('=== Verifying Treasury Address ===\n')
  console.log(`Treasury: ${SHAPESHIFT_TREASURY}`)
  console.log(`AVNU Exchange: ${AVNU_EXCHANGE}\n`)

  // Get current block
  const currentBlock = await rpcCall<number>('starknet_blockNumber', [])
  const now = Math.floor(Date.now() / 1000)
  console.log(`Current block: ${currentBlock}\n`)

  // Estimate block range
  const estimatedStart = estimateBlockFromTimestamp(currentBlock, now, START_TIMESTAMP, STARKNET_BLOCK_TIME_SECONDS)
  const estimatedEnd = estimateBlockFromTimestamp(currentBlock, now, END_TIMESTAMP, STARKNET_BLOCK_TIME_SECONDS)
  const startBlock = Math.max(0, estimatedStart - BLOCK_ESTIMATION_BUFFER)
  const endBlock = Math.min(currentBlock, estimatedEnd + BLOCK_ESTIMATION_BUFFER)

  console.log(`Block range: ${startBlock} to ${endBlock}\n`)

  // Fetch ALL Transfer events to treasury (any sender)
  console.log('Fetching ALL Transfer events to treasury...')
  const result = await rpcCall<StarknetEventsResponse>('starknet_getEvents', [
    {
      from_block: { block_number: startBlock },
      to_block: { block_number: endBlock },
      keys: [
        [TRANSFER_SELECTOR],
        [], // from: any
        [SHAPESHIFT_TREASURY], // to: treasury
      ],
      chunk_size: 1000,
    },
  ])

  const events = result.events || []
  console.log(`Total transfers to treasury: ${events.length}\n`)

  if (events.length === 0) {
    console.log('❌ No transfers found to treasury address')
    console.log('This could mean:')
    console.log('  1. The treasury address is incorrect')
    console.log('  2. No transfers occurred during this period')
    console.log('  3. The date range is outside available data')
    return
  }

  // Group by sender
  const bySender = new Map<string, number>()
  for (const event of events) {
    const from = normalizeStarknetAddress(event.keys[1])
    bySender.set(from, (bySender.get(from) || 0) + 1)
  }

  console.log('Transfers by sender:')
  for (const [sender, count] of [...bySender.entries()].sort((a, b) => b[1] - a[1])) {
    const isAvnu = sender === AVNU_EXCHANGE
    console.log(`  ${sender}: ${count} transfers ${isAvnu ? '← AVNU' : ''}`)
  }

  // Check if AVNU sent anything
  const avnuTransfers = events.filter(e => normalizeStarknetAddress(e.keys[1]) === AVNU_EXCHANGE)
  console.log(`\nAVNU transfers: ${avnuTransfers.length}`)

  if (avnuTransfers.length > 0) {
    console.log('\n✅ AVNU integration should be working!')
    console.log('Sample AVNU transfers:')
    avnuTransfers.slice(0, 3).forEach((e, idx) => {
      console.log(`  ${idx + 1}. TX: ${e.transaction_hash}`)
      console.log(`     Token: ${e.from_address}`)
      console.log(`     Block: ${e.block_number}`)
    })
  } else {
    console.log('\n⚠️  No transfers from AVNU Exchange found')
    console.log('AVNU may not have processed any swaps with ShapeShift affiliate during this period')
  }
}

main().catch(console.error)
