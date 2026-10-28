import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import type { UnchainedTx } from './unchained'

const client = { resolveBlock: (timestamp: number) => Promise.resolve(timestamp) }
void mock.module('./alchemy', () => ({ createAlchemyClient: () => client }))

const { getTreasuryFees } = await import('./treasuryFees')

const TREASURY = '0x9c9aa90363630d4ab1d9dbf416cc3bbc8d3ed502'
const SENDER = '0x0f7ae28de1c8532170ad4ee566b5801485c13a0e'
const USER = '0x00000000000000000000000000000000000000aa'
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

const feeTx = (txid: string, overrides: Partial<UnchainedTx> = {}): UnchainedTx => ({
  txid,
  blockHeight: 1,
  timestamp: 100,
  status: 1,
  from: USER,
  to: null,
  value: '0',
  tokenTransfers: [
    { from: SENDER, to: TREASURY, contract: USDC, value: '18', decimals: 6, name: '', symbol: '', type: 'ERC20' },
  ],
  ...overrides,
})

// Two pages, so the own-swap check is exercised across the cursor
const pages = [
  {
    txs: [
      feeTx('0xuser'),
      feeTx('0xown'),
      feeTx('0xunrelated', { tokenTransfers: [] }),
      feeTx('0xreverted', { status: 0 }),
    ],
    cursor: 'next',
  },
  {
    txs: [
      feeTx('0xspend', { internalTxs: [{ from: TREASURY, to: SENDER, value: '1000' }] }),
      feeTx('0xlate', { timestamp: 300 }),
    ],
  },
]

const scan = (isOwnSwap?: (txid: string, client: unknown) => Promise<boolean>) =>
  getTreasuryFees({
    service: 'across',
    chainId: 'eip155:8453',
    treasury: TREASURY,
    senders: [SENDER],
    startTimestamp: 50,
    endTimestamp: 200,
    isOwnSwap,
  })

describe('getTreasuryFees', () => {
  let get: ReturnType<typeof spyOn>

  beforeEach(() => {
    const fakeGet = (_url: string, config?: AxiosRequestConfig<unknown>) => {
      const { cursor } = (config?.params ?? {}) as { cursor?: string }
      return Promise.resolve({ data: cursor ? pages[1] : pages[0] })
    }
    get = spyOn(axios, 'get').mockImplementation(fakeGet as typeof axios.get)
  })

  afterEach(() => {
    get.mockRestore()
  })

  it("drops the txs the tracker's own-swap check flags, checking only fee txs", async () => {
    const checked: string[] = []
    const fees = await scan((txid, hookClient) => {
      expect(hookClient).toBe(client)
      checked.push(txid)
      return Promise.resolve(txid === '0xown')
    })

    expect(checked.sort()).toEqual(['0xown', '0xuser'])
    expect(fees.map(({ txHash, amount }) => [txHash, amount])).toEqual([['0xuser', '18']])
  })

  it('keeps every fee tx without an own-swap check, still skipping same-chain spends', async () => {
    const fees = await scan()

    expect(fees.map(({ txHash }) => txHash)).toEqual(['0xuser', '0xown'])
  })
})
