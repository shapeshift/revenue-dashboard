import { describe, expect, it } from 'bun:test'
import type { Hex } from 'viem'
import { padHex } from 'viem'

import { ERC20_TRANSFER_TOPIC } from './evmLogClient'
import type { AccountState, CallFrame, Log, EvmLogClient } from './evmLogClient'
import {
  collectNativeTransfers,
  collectTokenTransfers,
  dropNativeTokenEchoes,
  findStateChangeBlocks,
  getRpcTxHistory,
} from './rpcTxHistory'
import type { UnchainedTokenTransfer } from './unchained'

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
    expect(queried.sort((a, b) => a - b)).toEqual([99, 200])
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

describe('dropNativeTokenEchoes', () => {
  const CELO = '0x471ece3750da237f93b8e339c536989b8978a438'
  const OTHER = '0x00000000000000000000000000000000000000cc'
  const transfer = (contract: string, value: string): UnchainedTokenTransfer => ({
    from: HANDLER,
    to: TREASURY,
    value,
    contract,
    decimals: 0,
    name: '',
    symbol: '',
    type: 'ERC20',
  })

  it('drops native token logs that echo a traced native transfer, once per transfer', () => {
    const native = [{ from: HANDLER, to: TREASURY, value: '7' }]
    const kept = dropNativeTokenEchoes(
      [transfer(CELO, '7'), transfer(CELO, '7'), transfer(CELO, '3'), transfer(OTHER, '7')],
      native,
      CELO
    )

    expect(kept).toEqual([transfer(CELO, '7'), transfer(CELO, '3'), transfer(OTHER, '7')])
  })

  it('keeps everything on chains without a native token contract', () => {
    const transfers = [transfer(CELO, '7')]
    expect(dropNativeTokenEchoes(transfers, [{ from: HANDLER, to: TREASURY, value: '7' }], undefined)).toBe(transfers)
  })
})

describe('getRpcTxHistory', () => {
  it('refuses a treasury with code, whose native moves bisection could miss', async () => {
    const client = { getCode: () => Promise.resolve('0xef0100aa') } as unknown as EvmLogClient

    const error = await getRpcTxHistory(client, TREASURY, 10, 20).catch((err: unknown) => err)
    expect(String(error)).toContain('has code')
  })
})
