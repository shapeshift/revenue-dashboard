import axios from 'axios'
import { decodeAbiParameters, padHex, zeroAddress } from 'viem'

// Chain configurations for Portals
const CHAIN_CONFIGS = [
  {
    chainId: 'eip155:1',
    network: 'ethereum',
    router: '0xbf5a7f3629fb325e2a8453d595ab103465f75e62',
    treasury: '0x90a48d5cf7343b08da12e067680b4c6dbfe551be',
    explorerUrl: 'https://eth.blockscout.com',
    apiType: 'blockscout' as const,
  },
  {
    chainId: 'eip155:42161',
    network: 'arbitrum',
    router: '0x34b6a821d2f26c6b7cdb01cd91895170c6574a0d',
    treasury: '0x38276553F8fbf2A027D901F8be45f00373d8Dd48',
    explorerUrl: 'https://arbitrum.blockscout.com',
    apiType: 'blockscout' as const,
  },
  {
    chainId: 'eip155:10',
    network: 'optimism',
    router: '0x43838f0c0d499f5c3101589f0f452b1fc7515178',
    treasury: '0x6268d07327f4fb7380732dc6d63d95F88c0E083b',
    explorerUrl: 'https://optimism.blockscout.com',
    apiType: 'blockscout' as const,
  },
  {
    chainId: 'eip155:8453',
    network: 'base',
    router: '0xb0324286b3ef7dddc93fb2ff7c8b7b8a3524803c',
    treasury: '0x9c9aA90363630d4ab1D9dbF416cc3BBC8d3Ed502',
    explorerUrl: 'https://base.blockscout.com',
    apiType: 'blockscout' as const,
  },
  {
    chainId: 'eip155:137',
    network: 'polygon',
    router: '0xC74063fdb47fe6dCE6d029A489BAb37b167Da57f',
    treasury: '0xB5F944600785724e31Edb90F9DFa16dBF01Af000',
    explorerUrl: 'https://polygon.blockscout.com',
    apiType: 'blockscout' as const,
  },
  {
    chainId: 'eip155:100',
    network: 'gnosis',
    router: '0x8e74454b2cf2f6cc2a06083ef122187551cf391c',
    treasury: '0xb0E3175341794D1dc8E5F02a02F9D26989EbedB3',
    explorerUrl: 'https://gnosis.blockscout.com',
    apiType: 'blockscout' as const,
  },
]

const PORTAL_EVENT_SIGNATURE = '0x5915121ae705c6baa1bd6698f437ff30eb4b7dbd20e1f7d83c2f1a8be09a1f03'
const PORTAL_EVENT_ABI = [
  { type: 'address', name: 'inputToken' },
  { type: 'uint256', name: 'inputAmount' },
  { type: 'address', name: 'outputToken' },
  { type: 'uint256', name: 'outputAmount' },
  { type: 'address', name: 'recipient' },
] as const

const AFFILIATE_FEE_BPS = 55
const FEE_BPS_DENOMINATOR = 10000

// January 31, 2025 timestamps
const START_TIMESTAMP = 1738281600
const END_TIMESTAMP = 1738367999

// Decode Portal event data
function decodePortalEventData(data: string) {
  if (!data || data.length < 258) return null

  try {
    const decoded = decodeAbiParameters(PORTAL_EVENT_ABI, data as `0x${string}`)
    return {
      inputToken: decoded[0],
      inputAmount: decoded[1].toString(),
      outputToken: decoded[2],
      outputAmount: decoded[3].toString(),
    }
  } catch {
    return null
  }
}

// Calculate fallback fee (55 bps of input amount)
function calculateFallbackFee(inputAmount: string): string {
  const amount = BigInt(inputAmount)
  const fee = (amount * BigInt(AFFILIATE_FEE_BPS)) / BigInt(FEE_BPS_DENOMINATOR)
  return fee.toString()
}

// Format amount with decimals
function formatAmount(amount: string, decimals: number): string {
  const num = BigInt(amount)
  const divisor = BigInt(10 ** decimals)
  const whole = num / divisor
  const fraction = num % divisor
  return `${whole}.${fraction.toString().padStart(decimals, '0')}`
}

// Get block numbers for timestamp range
async function getBlockNumbersForRange(
  config: (typeof CHAIN_CONFIGS)[0],
  startTimestamp: number,
  endTimestamp: number
): Promise<{ fromBlock: number; toBlock: number } | null> {
  try {
    const startResponse = await axios.get(`${config.explorerUrl}/api`, {
      params: {
        module: 'block',
        action: 'getblocknobytime',
        timestamp: startTimestamp,
        closest: 'before',
      },
      timeout: 15000,
    })

    const endResponse = await axios.get(`${config.explorerUrl}/api`, {
      params: {
        module: 'block',
        action: 'getblocknobytime',
        timestamp: endTimestamp,
        closest: 'before',
      },
      timeout: 15000,
    })

    if (startResponse.data.status === '1' && endResponse.data.status === '1') {
      return {
        fromBlock: parseInt(
          typeof startResponse.data.result === 'string'
            ? startResponse.data.result
            : startResponse.data.result.blockNumber,
          10
        ),
        toBlock: parseInt(
          typeof endResponse.data.result === 'string' ? endResponse.data.result : endResponse.data.result.blockNumber,
          10
        ),
      }
    }
  } catch (error) {
    console.error(`Error getting block range: ${error}`)
  }

  return null
}

// Get token transfer to treasury from transaction
async function getFeeTransferFromExplorer(config: (typeof CHAIN_CONFIGS)[0], txHash: string) {
  const treasuryLower = config.treasury.toLowerCase()

  try {
    const url = `${config.explorerUrl}/api/v2/transactions/${txHash}/token-transfers`
    const { data } = await axios.get(url, { timeout: 10000 })

    for (const transfer of data.items || []) {
      if (transfer.to?.hash?.toLowerCase() === treasuryLower && transfer.token_type === 'ERC-20') {
        return {
          token: transfer.token.address_hash,
          amount: transfer.total.value,
          decimals: parseInt(transfer.total.decimals),
          symbol: transfer.token.symbol || '',
        }
      }
    }
  } catch (error) {
    // Ignore errors, will use fallback
  }

  return null
}

// Query Portal events for a chain
async function queryChainEvents(config: (typeof CHAIN_CONFIGS)[0]) {
  console.log(`\n=== ${config.network.toUpperCase()} ===`)

  try {
    const blockRange = await getBlockNumbersForRange(config, START_TIMESTAMP, END_TIMESTAMP)

    if (!blockRange) {
      console.log(`❌ Failed to get block range`)
      return { chain: config.network, events: 0, totalFeeUsd: 0 }
    }

    console.log(`Block range: ${blockRange.fromBlock} to ${blockRange.toBlock}`)

    const treasuryTopic = padHex(config.treasury.toLowerCase() as `0x${string}`, { size: 32 })
    const url = `${config.explorerUrl}/api`

    const { data } = await axios.get(url, {
      params: {
        module: 'logs',
        action: 'getLogs',
        address: config.router,
        topic0: PORTAL_EVENT_SIGNATURE,
        topic0_3_opr: 'and',
        topic3: treasuryTopic,
        fromBlock: blockRange.fromBlock,
        toBlock: blockRange.toBlock,
        sort: 'desc',
      },
      timeout: 30000,
    })

    if (data.status !== '1' || !Array.isArray(data.result)) {
      console.log(`❌ API returned error: ${data.message || 'Unknown error'}`)
      return { chain: config.network, events: 0, totalFeeUsd: 0 }
    }

    const eventCount = data.result.length
    console.log(`✅ Found ${eventCount} Portal events`)

    if (eventCount > 0) {
      console.log('\nSample events:')

      for (let i = 0; i < Math.min(3, eventCount); i++) {
        const log = data.result[i]
        const decoded = decodePortalEventData(log.data)

        if (decoded) {
          const timestamp = parseInt(log.timeStamp, 16)
          const fallbackFee = calculateFallbackFee(decoded.inputAmount)

          console.log(`\n  Event ${i + 1}:`)
          console.log(`    TX: ${log.transactionHash}`)
          console.log(`    Time: ${new Date(timestamp * 1000).toISOString()}`)
          console.log(`    Input Token: ${decoded.inputToken === zeroAddress ? 'Native' : decoded.inputToken}`)
          console.log(`    Input Amount: ${decoded.inputAmount}`)
          console.log(`    Output Token: ${decoded.outputToken === zeroAddress ? 'Native' : decoded.outputToken}`)
          console.log(`    Calculated Fee (55 bps): ${fallbackFee}`)

          // Try to get actual fee transfer
          const feeTransfer = await getFeeTransferFromExplorer(config, log.transactionHash)
          if (feeTransfer) {
            console.log(`    Actual Fee Transfer:`)
            console.log(`      Token: ${feeTransfer.token}`)
            console.log(`      Amount: ${formatAmount(feeTransfer.amount, feeTransfer.decimals)} ${feeTransfer.symbol}`)
          }
        }
      }
    }

    return { chain: config.network, events: eventCount, logs: data.result }
  } catch (error) {
    console.error(`Error querying ${config.network}:`, error instanceof Error ? error.message : error)
    return { chain: config.network, events: 0, totalFeeUsd: 0, error: String(error) }
  }
}

// Main execution
async function main() {
  console.log('Testing Portals Integration for January 31, 2025')
  console.log(`Start: ${START_TIMESTAMP} (${new Date(START_TIMESTAMP * 1000).toISOString()})`)
  console.log(`End: ${END_TIMESTAMP} (${new Date(END_TIMESTAMP * 1000).toISOString()})`)

  const results = await Promise.all(CHAIN_CONFIGS.map(config => queryChainEvents(config)))

  console.log('\n\n=== SUMMARY ===')
  let totalEvents = 0
  for (const result of results) {
    console.log(`${result.chain.padEnd(15)}: ${result.events} events`)
    totalEvents += result.events
  }
  console.log(`${'TOTAL'.padEnd(15)}: ${totalEvents} events`)

  if (totalEvents === 0) {
    console.log('\n⚠️  No Portal events found for January 31, 2025')
  }
}

main().catch(console.error)
