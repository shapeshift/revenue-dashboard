import { describe, expect, it } from 'bun:test'
import type { Hex } from 'viem'
import { padHex } from 'viem'

import { ERC20_TRANSFER_TOPIC } from './evmLogClient'
import type { AccountState, CallFrame, Log, EvmLogClient } from './evmLogClient'
import {
  collectInternalTxs,
  collectNativeTransfers,
  collectTokenTransfers,
  findStateChangeBlocks,
  getRpcTxHistory,
} from './rpcTxHistory'

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
        frame({ type: 'delegatecall', from: HANDLER, to: TREASURY, value: '0x5' }),
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

describe('collectInternalTxs', () => {
  it("leaves out the top-level call's own value, as unchained does", () => {
    const root: CallFrame = {
      type: 'CALL',
      from: USER,
      to: TREASURY,
      value: '0x64',
      calls: [{ type: 'CALL', from: HANDLER, to: TREASURY, value: '0x7' }],
    }

    expect(collectInternalTxs(root, TREASURY)).toEqual([{ from: HANDLER, to: TREASURY, value: '7' }])
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

describe('getRpcTxHistory', () => {
  // A treasury with code makes every scan stop after its two code reads, so the reads count the scans
  const codedTreasury = () => {
    let codeReads = 0
    const getCode = () => {
      codeReads++
      return Promise.resolve('0xef0100aa')
    }
    const resolveBlockRange = (start: number, end: number) => Promise.resolve([start, end])
    const client = { chainId: 'eip155:1', getCode, resolveBlockRange } as unknown as EvmLogClient
    return { client, codeReads: () => codeReads }
  }

  it('refuses a treasury with code, whose native moves bisection could miss', async () => {
    const { client } = codedTreasury()

    const error = await getRpcTxHistory(client, TREASURY, 10, 20).catch((err: unknown) => err)
    expect(String(error)).toContain('has code')
  })

  it('shares one scan between concurrent callers of the same window', async () => {
    const { client, codeReads } = codedTreasury()
    const scan = (start: number) => getRpcTxHistory(client, TREASURY, start, 20).catch(() => undefined)

    await Promise.all([scan(10), scan(10), scan(11)])

    expect(codeReads()).toBe(4)
  })

  it('fails with the tx hash when a trace in a changed block failed', async () => {
    const client = {
      chainId: 'eip155:1',
      resolveBlockRange: () => Promise.resolve([10, 20]),
      getCode: () => Promise.resolve('0x'),
      getLogs: () => Promise.resolve([]),
      getAccountState: (_address: string, block: number) =>
        Promise.resolve({ balance: block >= 15 ? 1n : 0n, nonce: 0 }),
      traceBlock: () => Promise.resolve([{ txHash: '0xabc', error: 'tracer failed' }]),
    } as unknown as EvmLogClient

    const error = await getRpcTxHistory(client, TREASURY, 1000, 2000).catch((err: unknown) => err)
    expect(String(error)).toContain('Trace of 0xabc in block 15 failed: tracer failed')
  })
})
