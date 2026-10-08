import { describe, expect, test } from 'bun:test'
import { keccak256, toHex } from 'viem'

import { FEE_COLLECTED_TOPIC, SYMBIOSIS_PARTNER_ADDRESS } from './constants'
import { decodeFeeCollected, getStokenCoingeckoId } from './symbiosis'

// Host-chain leg of a $5 ETH -> Base USDC swap on 2026-10-08: 0.6% of 0.00181 sWETH
const feeCollectedLog = {
  topics: [
    FEE_COLLECTED_TOPIC,
    '0x000000000000000000000000f5aa59151be6515c4ca68a0282cf68b3ea4846fc',
    '0x0000000000000000000000007b7ad875f336ffd27a3872b243c025e60a028732',
  ],
  data: '0x000000000000000000000000000000000000000000000000000671f6e055580a000000000000000000000000000000000000000000000000000009e65862d0e9',
  blockNumber: '0x67690',
  transactionHash: '0xd8171a15f61f7ff7807d09ec3e0d040028d3cfb8fbd31b7f2d0a56c6c93884c3',
}

describe('FEE_COLLECTED_TOPIC', () => {
  test('is the event signature hash the collector emits', () => {
    expect(keccak256(toHex('FeeCollected(address,address,uint256,uint256)'))).toBe(FEE_COLLECTED_TOPIC)
  })
})

describe('decodeFeeCollected', () => {
  test('reads partner and token from the topics and the fee from the data', () => {
    const event = decodeFeeCollected(feeCollectedLog)

    expect(event.partner).toBe(SYMBIOSIS_PARTNER_ADDRESS.toLowerCase())
    expect(event.token).toBe('0x7b7ad875f336ffd27a3872b243c025e60a028732')
    expect(event.amount).toBe(1814154999846922n)
    expect(event.fee).toBe(10884929999081n)
    expect(event.blockNumber).toBe(423568)
    expect(event.txHash).toBe(feeCollectedLog.transactionHash)
  })

  test('the fee is 0.6% of the amount', () => {
    const { amount, fee } = decodeFeeCollected(feeCollectedLog)

    expect((amount * 6n) / 1000n).toBe(fee)
  })
})

describe('getStokenCoingeckoId', () => {
  test('prices an sToken as the asset it wraps', () => {
    expect(getStokenCoingeckoId('sWETH')).toBe('ethereum')
    expect(getStokenCoingeckoId('sUSDC')).toBe('usd-coin')
    expect(getStokenCoingeckoId('sUSDbC')).toBe('usd-coin')
  })

  test('leaves an unknown sToken unpriced rather than guessing', () => {
    expect(getStokenCoingeckoId('sXYZ')).toBeUndefined()
  })
})
