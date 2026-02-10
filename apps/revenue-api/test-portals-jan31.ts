import axios from 'axios'
import { padHex } from 'viem'

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
  {
    chainId: 'eip155:56',
    network: 'bsc',
    router: '0x34b6a821d2f26c6b7cdb01cd91895170c6574a0d',
    treasury: '0x8b92b1698b57bEDF2142297e9397875ADBb2297E',
    explorerUrl: '', // Deprecated API
    apiType: 'etherscan' as const,
    rpcUrl: 'https://bsc-dataseed.binance.org/',
  },
  {
    chainId: 'eip155:43114',
    network: 'avalanche',
    router: '0xbf5A7F3629fB325E2a8453D595AB103465F75E62',
    treasury: '0x74d63F31C2335b5b3BA7ad2812357672b2624cEd',
    explorerUrl: 'https://api.snowtrace.io',
    apiType: 'etherscan' as const,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
  },
]

const PORTAL_EVENT_SIGNATURE = '0x5915121ae705c6baa1bd6698f437ff30eb4b7dbd20e1f7d83c2f1a8be09a1f03'

// January 31, 2026 timestamps
const START_TIMESTAMP = 1769817600
const END_TIMESTAMP = 1769903999

// Convert timestamp to block number using RPC binary search
async function findBlockByTimestamp(rpcUrl: string, targetTimestamp: number): Promise<number | null> {
  try {
    // Get latest block
    const latestResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
      }),
    })
    const latestData = await latestResponse.json()
    const latestBlockNumber = parseInt(latestData.result.number, 16)
    const latestTimestamp = parseInt(latestData.result.timestamp, 16)

    if (targetTimestamp > latestTimestamp) {
      return null
    }

    // Binary search
    let low = 0
    let high = latestBlockNumber
    let closestBlock = latestBlockNumber

    for (let i = 0; i < 20; i++) {
      const mid = Math.floor((low + high) / 2)
      const blockHex = `0x${mid.toString(16)}`

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getBlockByNumber',
          params: [blockHex, false],
        }),
      })
      const data = await response.json()
      const blockTimestamp = parseInt(data.result.timestamp, 16)

      if (blockTimestamp === targetTimestamp) {
        return mid
      }

      if (blockTimestamp < targetTimestamp) {
        closestBlock = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    return closestBlock
  } catch (error) {
    console.error(`RPC error: ${error}`)
    return null
  }
}

// Get block numbers for timestamp range
async function getBlockNumbersForRange(
  config: (typeof CHAIN_CONFIGS)[0],
  startTimestamp: number,
  endTimestamp: number
): Promise<{ fromBlock: number; toBlock: number } | null> {
  if (config.apiType === 'blockscout') {
    try {
      // Try Blockscout API first
      const startResponse = await axios.get(`${config.explorerUrl}/api`, {
        params: {
          module: 'block',
          action: 'getblocknobytime',
          timestamp: startTimestamp,
          closest: 'before',
        },
      })

      const endResponse = await axios.get(`${config.explorerUrl}/api`, {
        params: {
          module: 'block',
          action: 'getblocknobytime',
          timestamp: endTimestamp,
          closest: 'before',
        },
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
            typeof endResponse.data.result === 'string'
              ? endResponse.data.result
              : endResponse.data.result.blockNumber,
            10
          ),
        }
      }
    } catch (error) {
      console.error(`Blockscout API error for ${config.network}: ${error}`)
    }
  }

  // Fallback to RPC for chains with deprecated APIs
  if (config.rpcUrl) {
    const fromBlock = await findBlockByTimestamp(config.rpcUrl, startTimestamp)
    const toBlock = await findBlockByTimestamp(config.rpcUrl, endTimestamp)

    if (fromBlock !== null && toBlock !== null) {
      return { fromBlock, toBlock }
    }
  }

  return null
}

// Query Portal events for a chain
async function queryChainEvents(config: (typeof CHAIN_CONFIGS)[0]) {
  console.log(`\n=== ${config.network.toUpperCase()} ===`)

  try {
    // Get block range
    const blockRange = await getBlockNumbersForRange(config, START_TIMESTAMP, END_TIMESTAMP)

    if (!blockRange) {
      console.log(`❌ Failed to get block range`)
      return { chain: config.network, events: 0, error: 'Failed to get block range' }
    }

    console.log(`Block range: ${blockRange.fromBlock} to ${blockRange.toBlock}`)

    // Query events from explorer
    const treasuryTopic = padHex(config.treasury.toLowerCase() as `0x${string}`, { size: 32 })
    const url = `${config.explorerUrl}/api`

    if (!config.explorerUrl) {
      console.log(`⚠️  No explorer URL (deprecated API)`)
      return { chain: config.network, events: 0, error: 'No explorer URL' }
    }

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
    })

    if (data.status !== '1' || !Array.isArray(data.result)) {
      console.log(`❌ API returned error: ${data.message || 'Unknown error'}`)
      return { chain: config.network, events: 0, error: data.message || 'Unknown error' }
    }

    const eventCount = data.result.length
    console.log(`✅ Found ${eventCount} Portal events`)

    // Sample first event if available
    if (eventCount > 0) {
      const firstEvent = data.result[0]
      console.log(`Sample TX: ${firstEvent.transactionHash}`)
      console.log(`Timestamp: ${new Date(parseInt(firstEvent.timeStamp, 16) * 1000).toISOString()}`)
    }

    return { chain: config.network, events: eventCount, data: data.result }
  } catch (error) {
    console.error(`Error querying ${config.network}:`, error instanceof Error ? error.message : error)
    return { chain: config.network, events: 0, error: String(error) }
  }
}

// Main execution
async function main() {
  console.log('Testing Portals Integration for January 31, 2026')
  console.log(`Start: ${START_TIMESTAMP} (${new Date(START_TIMESTAMP * 1000).toISOString()})`)
  console.log(`End: ${END_TIMESTAMP} (${new Date(END_TIMESTAMP * 1000).toISOString()})`)

  const results = await Promise.all(CHAIN_CONFIGS.map(config => queryChainEvents(config)))

  console.log('\n=== SUMMARY ===')
  let totalEvents = 0
  for (const result of results) {
    console.log(`${result.chain}: ${result.events} events`)
    totalEvents += result.events
  }
  console.log(`\nTotal events across all chains: ${totalEvents}`)

  if (totalEvents === 0) {
    console.log('\n⚠️  No Portal events found for January 31, 2026')
    console.log('This could mean:')
    console.log('- No swaps occurred on this date')
    console.log('- The date is too far in the future')
    console.log('- API rate limiting or errors')
  }
}

main().catch(console.error)
