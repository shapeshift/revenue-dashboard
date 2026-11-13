import { describe, expect, it } from 'bun:test'
import type { Hex } from 'viem'
import { padHex } from 'viem'

import type { AccountState, CallFrame, Log } from './evmLogClient'
import { ERC20_TRANSFER_TOPIC } from './evmLogClient'
import { collectNativeTransfers, collectTokenTransfers, findStateChangeBlocks } from './rpcTxHistory'

const TREASURY = '0xf5aa59151be6515c4ca68a0282cf68b3ea4846fc'
const HANDLER = '0x0f7ae28de1c8532170ad4ee566b5801485c13a0e'
const USER = '0x00000000000000000000000000000000000000aa'

describe('findStateChangeBlocks', () => {
  // State after each block: inflows at 3 and 7, a send at 12 that leaves the balance where it was
  const stateAt = (block: number): AccountState => ({
    balance: (block >= 3 ? 5n : 0n) + (block >= 7 ? 2n : 0n),
    nonce: block >= 12 ? 1 : 0,
  })

  it('finds every block where the balance or nonce moved', async () => {
    const queried: number[] = []
    const blocks = await findStateChangeBlocks(
      block => {
        queried.push(block)
        return Promise.resolve(stateAt(block))
      },
      1,
      1000
    )

    expect(blocks).toEqual([3, 7, 12])
    expect(queried.length).toBeLessThan(60)
  })

  it('reads only the two ends when nothing moved', async () => {
    const queried: number[] = []
    const blocks = await findStateChangeBlocks(
      block => {
        queried.push(block)
        return Promise.resolve({ balance: 9n, nonce: 0 })
      },
      100,
      200
    )

    expect(blocks).toEqual([])
    expect(queried.sort()).toEqual([200, 99])
  })
})

describe('collectNativeTransfers', () => {
  const frame = (overrides: Partial<CallFrame>): CallFrame => ({ type: 'CALL', from: USER, to: HANDLER, ...overrides })

  it('keeps value moved to or from the treasury, skipping reverted subtrees and delegatecalls', () => {
    const trace = frame({
      value: '0x64',
      calls: [
        frame({ from: HANDLER, to: TREASURY, value: '0x7' }),
        frame({ from: HANDLER, to: TREASURY, value: '0x9', error: 'execution reverted' }),
        frame({ type: 'DELEGATECALL', from: HANDLER, to: TREASURY, value: '0x5' }),
        frame({ from: HANDLER, to: USER, value: '0x50' }),
        frame({ from: HANDLER, to: TREASURY, value: '0x0' }),
      ],
    })

    expect(collectNativeTransfers(trace, TREASURY)).toEqual([{ from: HANDLER, to: TREASURY, value: '7' }])
  })

  it('drops everything when the tx itself reverted', () => {
    const trace = frame({ error: 'execution reverted', calls: [frame({ from: HANDLER, to: TREASURY, value: '0x7' })] })

    expect(collectNativeTransfers(trace, TREASURY)).toEqual([])
  })
})

describe('collectTokenTransfers', () => {
  const TOKEN = '0x00000000000000000000000000000000000000cc'
  const log = (from: string, to: string, data: Hex, topicCount = 3): Log => ({
    address: TOKEN,
    topics: [ERC20_TRANSFER_TOPIC, padHex(from as Hex, { size: 32 }), padHex(to as Hex, { size: 32 })].slice(
      0,
      topicCount
    ) as Log['topics'],
    data,
    blockNumber: '0x1',
    transactionHash: '0x01',
  })

  it('keeps ERC20 transfers in and out of the treasury, skipping others and malformed transfers', () => {
    const transfers = collectTokenTransfers(
      [
        log(HANDLER, TREASURY, '0x07'),
        log(TREASURY, USER, '0x05'),
        log(HANDLER, USER, '0x50'),
        log(HANDLER, TREASURY, '0x'),
        log(HANDLER, TREASURY, '0x09', 2),
      ],
      TREASURY
    )

    expect(transfers.map(({ from, to, value }) => ({ from, to, value }))).toEqual([
      { from: HANDLER, to: TREASURY, value: '7' },
      { from: TREASURY, to: USER, value: '5' },
    ])
  })
})
