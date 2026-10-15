import { describe, expect, test } from 'bun:test'
import { encodeAbiParameters, encodeEventTopics } from 'viem'

import { FEES_TAKEN_EVENT, FYND_FEE_RECEIVER } from './constants'
import { decodeOurFee } from './fynd'

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const FYND_ROUTER_FEE_RECIPIENT = '0xA5503D92EE16a78E602996AD362674Dc49034A14'

const feesTakenLog = (token: string, fees: { recipient: string; feeAmount: bigint }[]) => ({
  topics: encodeEventTopics({ abi: [FEES_TAKEN_EVENT], eventName: 'FeesTaken', args: { token: token as `0x${string}` } }),
  data: encodeAbiParameters(
    [{ type: 'tuple[]', components: [{ type: 'address', name: 'recipient' }, { type: 'uint256', name: 'feeAmount' }] }],
    [fees.map(f => ({ recipient: f.recipient as `0x${string}`, feeAmount: f.feeAmount }))]
  ),
  blockNumber: '0x322d897' as const,
  transactionHash: '0xca23f7a3dd22fe8c168ce6f5a2a97a970f191b91f557f42f31c6d34373a4f5d0' as const,
})

describe('decodeOurFee', () => {
  // Base tx 0xca23f7a3…f5d0: 2000021 USDC gross, 75 bps taken, split 20% Fynd / 80% us
  test('keeps only our recipient entry from a swap with our fee', () => {
    const log = feesTakenLog(USDC_BASE, [
      { recipient: FYND_ROUTER_FEE_RECIPIENT, feeAmount: 3000n },
      { recipient: FYND_FEE_RECEIVER, feeAmount: 12000n },
    ])

    expect(decodeOurFee(log)).toEqual({
      token: USDC_BASE.toLowerCase(),
      fee: 12000n,
      blockNumber: 52615319,
      txHash: '0xca23f7a3dd22fe8c168ce6f5a2a97a970f191b91f557f42f31c6d34373a4f5d0',
    })
  })

  test('ignores swaps from other integrators', () => {
    const log = feesTakenLog(USDC_BASE, [
      { recipient: FYND_ROUTER_FEE_RECIPIENT, feeAmount: 3000n },
      { recipient: '0x000000000000000000000000000000000000dEaD', feeAmount: 12000n },
    ])

    expect(decodeOurFee(log)).toBeUndefined()
  })

  test('ignores a zero-amount entry for our receiver', () => {
    const log = feesTakenLog(USDC_BASE, [{ recipient: FYND_FEE_RECEIVER, feeAmount: 0n }])

    expect(decodeOurFee(log)).toBeUndefined()
  })
})
