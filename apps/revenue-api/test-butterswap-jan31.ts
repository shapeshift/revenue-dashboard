import { encodeAbiParameters, parseAbiParameters } from 'viem'

// Constants
const MAP_RPC_URL = 'https://rpc.maplabs.io/'
const BUTTERSWAP_CONTRACT = '0x4De2ADb9cB88c10Bf200F76c18035cbB8906b6bC'
const MAP_USDT_ADDRESS = '0x33daba9618a75a7aff103e53afe530fbacf4a3dd'
const BUTTERSWAP_AFFILIATE_ID = 26
const GET_TOTAL_BALANCE_SELECTOR = '0x47b2f8d9'
const BLOCK_TIME_SECONDS = 5
const HEX_RADIX = 16
const HEX_PREFIX_LENGTH = 2
const UINT256_HEX_LENGTH = 66
const USDT_DECIMALS = 18 // MAP Protocol bridged USDT uses 18 decimals (unusual but verified on-chain)

// Jan 31, 2026 timestamps (corrected - user was right!)
const JAN_31_START = 1769817600 // 2026-01-31 00:00:00 UTC
const JAN_31_END = 1769903999 // 2026-01-31 23:59:59 UTC

// Also try Feb 9, 2026 (yesterday) as a working comparison
const FEB_9_START = 1770604800 // 2026-02-09 00:00:00 UTC
const FEB_9_END = 1770691199 // 2026-02-09 23:59:59 UTC

// Token list (fallback tokens)
const FALLBACK_TOKENS = [
  '0x05ab928d446d8ce6761e368c8e7be03c3168a9ec',
  '0x33daba9618a75a7aff103e53afe530fbacf4a3dd',
  '0x9f722b2cb30093f766221fd0d37964949ed66918',
  '0xb877e3562a660c7861117c2f1361a26abaf19beb',
  '0x5de6606ae1250c64560a603b40078de268240fdd',
  '0xc478a25240d9c072ebec5109b417e0a78a41667c',
  '0x593a37fe0f6dfd0b6c5a051e9a44aa0f6922a1a2',
  '0x0e9e7317c7132604c009c9860a259a3da33a3ed3',
]

interface RpcResponse<T> {
  result: T
  error?: { code: number; message: string }
}

const rpcCall = async <T>(method: string, params: unknown[]): Promise<T> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await fetch(MAP_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`RPC HTTP error: ${response.status} ${response.statusText}`)
    }

    const data: RpcResponse<T> = await response.json()

    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`)
    }

    return data.result
  } catch (error) {
    clearTimeout(timeoutId)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`RPC request timeout after 10000ms`)
    }
    throw error
  }
}

const getBlockNumber = async (): Promise<number> => {
  const result = await rpcCall<string>('eth_blockNumber', [])
  return parseInt(result, HEX_RADIX)
}

const estimateBlockFromTimestamp = (
  currentBlock: number,
  currentTimestamp: number,
  targetTimestamp: number,
  blockTimeSeconds: number
): number => {
  const blocksAgo = Math.floor((currentTimestamp - targetTimestamp) / blockTimeSeconds)
  const estimatedBlock = currentBlock - blocksAgo
  return Math.max(0, Math.min(estimatedBlock, currentBlock))
}

const getTotalBalance = async (blockNumber: number, tokens: string[]): Promise<bigint> => {
  const params = encodeAbiParameters(parseAbiParameters('uint256, address[], address'), [
    BigInt(BUTTERSWAP_AFFILIATE_ID),
    tokens as `0x${string}`[],
    MAP_USDT_ADDRESS as `0x${string}`,
  ])

  const data = GET_TOTAL_BALANCE_SELECTOR + params.slice(HEX_PREFIX_LENGTH)
  const blockHex = `0x${blockNumber.toString(HEX_RADIX)}`

  console.log(`  Block hex: ${blockHex}`)
  console.log(`  Contract: ${BUTTERSWAP_CONTRACT}`)
  console.log(`  Data: ${data.slice(0, 100)}...`)

  const result = await rpcCall<string>('eth_call', [{ to: BUTTERSWAP_CONTRACT, data }, blockHex])

  console.log(`  Raw result: ${result}`)
  console.log(`  Result length: ${result.length}`)

  if (!result || result === '0x') {
    console.log('  Empty result - returning 0')
    return BigInt(0)
  }

  const sliced = result.slice(0, UINT256_HEX_LENGTH)
  console.log(`  Sliced result: ${sliced}`)

  return BigInt(sliced)
}

const main = async () => {
  console.log('=== ButterSwap Integration Analysis for Jan 31, 2026 ===\n')
  console.log(`Testing period: ${new Date(JAN_31_START * 1000).toISOString()} to ${new Date(JAN_31_END * 1000).toISOString()}`)
  console.log(`Start timestamp: ${JAN_31_START}`)
  console.log(`End timestamp: ${JAN_31_END}\n`)

  try {
    // Get current block
    console.log('Fetching current block number...')
    const currentBlock = await getBlockNumber()
    const now = Math.floor(Date.now() / 1000)
    console.log(`Current block: ${currentBlock}`)
    console.log(`Current time: ${now} (${new Date(now * 1000).toISOString()})\n`)

    // Test contract at current block first
    console.log('Testing contract at current block...')
    const currentBalance = await getTotalBalance(currentBlock, FALLBACK_TOKENS)
    console.log(`Balance at current block: ${currentBalance.toString()} (raw)`)
    console.log(`Balance at current block: ${Number(currentBalance) / 10 ** USDT_DECIMALS} USDT\n`)

    // Test Feb 9, 2026 (yesterday - should have data)
    console.log('=== Testing Feb 9, 2026 (yesterday) ===')
    const feb9StartBlock = estimateBlockFromTimestamp(currentBlock, now, FEB_9_START, BLOCK_TIME_SECONDS)
    const feb9EndBlock = estimateBlockFromTimestamp(currentBlock, now, FEB_9_END, BLOCK_TIME_SECONDS)

    console.log(`Estimated start block (Feb 9 00:00:00): ${feb9StartBlock}`)
    console.log(`Estimated end block (Feb 9 23:59:59): ${feb9EndBlock}`)
    console.log(`Block range: ${feb9EndBlock - feb9StartBlock} blocks\n`)

    console.log('Querying ButterSwap affiliate balance at start of Feb 9...')
    const feb9BalanceAtStart = await getTotalBalance(feb9StartBlock, FALLBACK_TOKENS)
    console.log(`Balance at start: ${feb9BalanceAtStart.toString()} (raw)`)
    console.log(`Balance at start: ${Number(feb9BalanceAtStart) / 10 ** USDT_DECIMALS} USDT\n`)

    console.log('Querying ButterSwap affiliate balance at end of Feb 9...')
    const feb9BalanceAtEnd = await getTotalBalance(feb9EndBlock, FALLBACK_TOKENS)
    console.log(`Balance at end: ${feb9BalanceAtEnd.toString()} (raw)`)
    console.log(`Balance at end: ${Number(feb9BalanceAtEnd) / 10 ** USDT_DECIMALS} USDT\n`)

    const feb9Fees = feb9BalanceAtEnd - feb9BalanceAtStart
    const feb9FeesUsd = Number(feb9Fees) / 10 ** USDT_DECIMALS

    console.log('=== RESULTS FOR FEB 9, 2026 ===')
    console.log(`Fees collected on Feb 9, 2026: ${feb9Fees.toString()} (raw)`)
    console.log(`Fees collected on Feb 9, 2026: ${feb9FeesUsd} USDT`)
    console.log(`Expected revenue (USD): $${feb9FeesUsd.toFixed(2)}\n`)

    // Now test Jan 31, 2026
    console.log('=== Testing Jan 31, 2026 ===')
    const startBlock = estimateBlockFromTimestamp(currentBlock, now, JAN_31_START, BLOCK_TIME_SECONDS)
    const endBlock = estimateBlockFromTimestamp(currentBlock, now, JAN_31_END, BLOCK_TIME_SECONDS)

    console.log(`Estimated start block (Jan 31 00:00:00): ${startBlock}`)
    console.log(`Estimated end block (Jan 31 23:59:59): ${endBlock}`)
    console.log(`Block range: ${endBlock - startBlock} blocks\n`)

    // Query balances using fallback token list
    console.log('Querying ButterSwap affiliate balance at start of day...')
    const balanceAtStart = await getTotalBalance(startBlock, FALLBACK_TOKENS)
    console.log(`Balance at start: ${balanceAtStart.toString()} (raw)`)
    console.log(`Balance at start: ${Number(balanceAtStart) / 10 ** USDT_DECIMALS} USDT\n`)

    console.log('Querying ButterSwap affiliate balance at end of day...')
    const balanceAtEnd = await getTotalBalance(endBlock, FALLBACK_TOKENS)
    console.log(`Balance at end: ${balanceAtEnd.toString()} (raw)`)
    console.log(`Balance at end: ${Number(balanceAtEnd) / 10 ** USDT_DECIMALS} USDT\n`)

    // Calculate fees
    const feesCollected = balanceAtEnd - balanceAtStart
    const feesUsd = Number(feesCollected) / 10 ** USDT_DECIMALS

    console.log('=== RESULTS FOR JAN 31, 2026 ===')
    console.log(`Fees collected on Jan 31, 2026: ${feesCollected.toString()} (raw)`)
    console.log(`Fees collected on Jan 31, 2026: ${feesUsd} USDT`)
    console.log(`Expected revenue (USD): $${feesUsd.toFixed(2)}`)

    if (feesCollected <= BigInt(0)) {
      console.log('\nNote: No fees collected or negative fees (balance decreased)')
    }

  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main()
