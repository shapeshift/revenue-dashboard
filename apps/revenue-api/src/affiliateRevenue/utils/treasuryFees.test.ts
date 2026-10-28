import { describe, expect, it } from 'bun:test'

import { extractTreasuryFees } from './treasuryFees'

const TREASURY = '0x9c9aa90363630d4ab1d9dbf416cc3bbc8d3ed502'
const SENDER = '0x663dc15d3c1ac63ff12e45ab68fea3f0a883c251'
const USER = '0x00000000000000000000000000000000000000aa'
const SINGLETON = '0x3e5c63644e683549055b9be8653de26e0b4cd36e'
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
const WETH = '0x4200000000000000000000000000000000000006'

const params = { service: 'debridge' as const, chainId: 'eip155:8453', treasury: TREASURY, senders: new Set([SENDER]) }

const transfer = (from: string, to: string, contract: string, value: string) => ({
  from,
  to,
  contract,
  value,
  decimals: 6,
  name: '',
  symbol: '',
  type: 'ERC20',
})

const amounts = (fees: ReturnType<typeof extractTreasuryFees>) => fees.map(({ assetId, amount }) => [assetId, amount])

describe('extractTreasuryFees', () => {
  it('sums transfers from a sender into the treasury per asset', () => {
    const fees = extractTreasuryFees(
      {
        txid: '0x1',
        timestamp: 1,
        from: USER,
        internalTxs: [{ from: SENDER, to: TREASURY, value: '5' }],
        tokenTransfers: [
          transfer(SENDER, TREASURY, USDC, '100'),
          transfer(SENDER, TREASURY, USDC, '20'),
          transfer(SENDER, USER, USDC, '19880'),
        ],
      },
      params
    )

    expect(amounts(fees)).toEqual([
      ['eip155:8453/slip44:60', '5'],
      [`eip155:8453/erc20:${USDC}`, '120'],
    ])
  })

  it('ignores transfers from other senders', () => {
    const fees = extractTreasuryFees(
      { txid: '0x1', timestamp: 1, from: USER, tokenTransfers: [transfer(USER, TREASURY, USDC, '100')] },
      params
    )

    expect(fees).toEqual([])
  })

  describe("the treasury's own swaps", () => {
    it('skips a token swap', () => {
      const fees = extractTreasuryFees(
        {
          txid: '0x1',
          timestamp: 1,
          from: USER,
          tokenTransfers: [
            transfer(TREASURY, SENDER, WETH, '1000'),
            transfer(SENDER, TREASURY, USDC, '18'),
            transfer(SENDER, TREASURY, USDC, '2982'),
          ],
        },
        params
      )

      expect(fees).toEqual([])
    })

    it('skips a native swap paid through another contract', () => {
      const fees = extractTreasuryFees(
        {
          txid: '0x1',
          timestamp: 1,
          from: USER,
          internalTxs: [{ from: TREASURY, to: USER, value: '1000' }],
          tokenTransfers: [transfer(SENDER, TREASURY, USDC, '3000')],
        },
        params
      )

      expect(fees).toEqual([])
    })

    it('skips an unwrap-then-swap', () => {
      const fees = extractTreasuryFees(
        {
          txid: '0x1',
          timestamp: 1,
          from: USER,
          internalTxs: [
            { from: WETH, to: TREASURY, value: '1000' },
            { from: TREASURY, to: SENDER, value: '1000' },
          ],
          tokenTransfers: [transfer(SENDER, TREASURY, USDC, '3000')],
        },
        params
      )

      expect(fees).toEqual([])
    })

    it('skips txs the treasury sends itself', () => {
      const fees = extractTreasuryFees(
        { txid: '0x1', timestamp: 1, from: TREASURY, internalTxs: [{ from: SENDER, to: TREASURY, value: '5' }] },
        params
      )

      expect(fees).toEqual([])
    })
  })

  describe('treasury outflows that are not spends', () => {
    it('keeps native fees a Safe forwards to its singleton', () => {
      const fees = extractTreasuryFees(
        {
          txid: '0x1',
          timestamp: 1,
          from: USER,
          internalTxs: [
            { from: TREASURY, to: SINGLETON, value: '5' },
            { from: SENDER, to: TREASURY, value: '5' },
          ],
        },
        params
      )

      expect(amounts(fees)).toEqual([['eip155:8453/slip44:60', '5']])
    })

    it('keeps fees despite zero-value transfers spoofed from the treasury', () => {
      const fees = extractTreasuryFees(
        {
          txid: '0x1',
          timestamp: 1,
          from: USER,
          tokenTransfers: [transfer(TREASURY, USER, USDC, '0'), transfer(SENDER, TREASURY, USDC, '100')],
        },
        params
      )

      expect(amounts(fees)).toEqual([[`eip155:8453/erc20:${USDC}`, '100']])
    })
  })
})
