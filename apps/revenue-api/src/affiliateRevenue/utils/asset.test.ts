import { describe, expect, test } from 'bun:test'

import {
  APTOS_CHAIN_ID,
  BITCOIN_CHAIN_ID,
  DOGECOIN_CHAIN_ID,
  ETHEREUM_CHAIN_ID,
  MAYACHAIN_CHAIN_ID,
  NEAR_CHAIN_ID,
  POLYGON_CHAIN_ID,
  SOLANA_CHAIN_ID,
  STARKNET_CHAIN_ID,
  THORCHAIN_CHAIN_ID,
  TRON_CHAIN_ID,
  ZCASH_CHAIN_ID,
} from '../constants'

import { buildAssetId, getNativeSlip44ForChain } from './asset'

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

describe('buildAssetId — native assets', () => {
  test('EVM native via missing token', () => {
    expect(buildAssetId(ETHEREUM_CHAIN_ID)).toBe('eip155:1/slip44:60')
    expect(buildAssetId(POLYGON_CHAIN_ID)).toBe('eip155:137/slip44:60')
  })

  test('EVM native sentinels (zero + EIP-7528, any case)', () => {
    expect(buildAssetId(ETHEREUM_CHAIN_ID, '0x0000000000000000000000000000000000000000')).toBe('eip155:1/slip44:60')
    expect(buildAssetId(ETHEREUM_CHAIN_ID, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE')).toBe('eip155:1/slip44:60')
  })

  test('non-EVM natives via missing token', () => {
    expect(buildAssetId(BITCOIN_CHAIN_ID)).toBe(`${BITCOIN_CHAIN_ID}/slip44:0`)
    expect(buildAssetId(DOGECOIN_CHAIN_ID)).toBe(`${DOGECOIN_CHAIN_ID}/slip44:3`)
    expect(buildAssetId(ZCASH_CHAIN_ID)).toBe(`${ZCASH_CHAIN_ID}/slip44:133`)
    expect(buildAssetId(THORCHAIN_CHAIN_ID)).toBe(`${THORCHAIN_CHAIN_ID}/slip44:931`)
    expect(buildAssetId(MAYACHAIN_CHAIN_ID)).toBe(`${MAYACHAIN_CHAIN_ID}/slip44:931`)
    expect(buildAssetId(TRON_CHAIN_ID)).toBe(`${TRON_CHAIN_ID}/slip44:195`)
    expect(buildAssetId(APTOS_CHAIN_ID)).toBe(`${APTOS_CHAIN_ID}/slip44:637`)
  })

  test('Solana native sentinels', () => {
    expect(buildAssetId(SOLANA_CHAIN_ID)).toBe(`${SOLANA_CHAIN_ID}/slip44:501`)
    expect(buildAssetId(SOLANA_CHAIN_ID, '11111111111111111111111111111111')).toBe(`${SOLANA_CHAIN_ID}/slip44:501`)
    expect(buildAssetId(SOLANA_CHAIN_ID, 'So11111111111111111111111111111111111111112')).toBe(
      `${SOLANA_CHAIN_ID}/slip44:501`
    )
  })
})

describe('buildAssetId — tokens', () => {
  test('EVM erc20 is lowercased', () => {
    expect(buildAssetId(ETHEREUM_CHAIN_ID, USDC)).toBe(`eip155:1/erc20:${USDC.toLowerCase()}`)
  })

  test('Solana SPL mint preserves case', () => {
    const mint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    expect(buildAssetId(SOLANA_CHAIN_ID, mint)).toBe(`${SOLANA_CHAIN_ID}/token:${mint}`)
  })

  test('Starknet token is normalized + padded', () => {
    expect(buildAssetId(STARKNET_CHAIN_ID, '0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8')).toBe(
      `${STARKNET_CHAIN_ID}/token:0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8`
    )
  })

  test('NEAR token is nep141', () => {
    expect(buildAssetId(NEAR_CHAIN_ID, 'usdt.tether-token.near')).toBe(`${NEAR_CHAIN_ID}/nep141:usdt.tether-token.near`)
  })

  test('throws for a token on a chain family without a token namespace', () => {
    expect(() => buildAssetId(BITCOIN_CHAIN_ID, 'whatever')).toThrow()
  })
})

describe('getNativeSlip44ForChain', () => {
  test('all EVM chains resolve to ETHEREUM/60', () => {
    expect(getNativeSlip44ForChain(ETHEREUM_CHAIN_ID)).toBe(60)
    expect(getNativeSlip44ForChain(POLYGON_CHAIN_ID)).toBe(60)
  })

  test('throws for an unknown chain', () => {
    expect(() => getNativeSlip44ForChain('cosmos:unknown-1')).toThrow()
  })
})
