import { describe, expect, it } from 'bun:test'
import type { Hex } from 'viem'
import { encodeAbiParameters, encodeEventTopics, pad, parseAbi, parseAbiParameters, toEventSelector } from 'viem'

import { DAO_TREASURY_ARBITRUM } from '../constants'
import type { EvmLogClient, Log } from '../utils'

import { isTreasuryDeposit } from './across'

const ABI = parseAbi([
  'event FilledRelay(bytes32 inputToken, bytes32 outputToken, uint256 inputAmount, uint256 outputAmount, uint256 repaymentChainId, uint256 indexed originChainId, uint256 indexed depositId, uint32 fillDeadline, uint32 exclusivityDeadline, bytes32 exclusiveRelayer, bytes32 indexed relayer, bytes32 depositor, bytes32 recipient, bytes32 messageHash, (bytes32 updatedRecipient, bytes32 updatedMessageHash, uint256 updatedOutputAmount, uint8 fillType) relayExecutionInfo)',
])
const HANDLER = '0x0f7ae28de1c8532170ad4ee566b5801485c13a0e'
const USER = '0x5daf465a9ccf64deb146eeae9e7bd40d6761c986'
const ZERO = pad('0x0')

const fill = (depositor: Hex): Log => {
  const topics = encodeEventTopics({
    abi: ABI,
    eventName: 'FilledRelay',
    args: { originChainId: 42161n, depositId: 1n, relayer: ZERO },
  })
  const data = encodeAbiParameters(
    parseAbiParameters(
      'bytes32, bytes32, uint256, uint256, uint256, uint32, uint32, bytes32, bytes32, bytes32, bytes32, (bytes32 updatedRecipient, bytes32 updatedMessageHash, uint256 updatedOutputAmount, uint8 fillType)'
    ),
    [
      ZERO,
      ZERO,
      1n,
      1n,
      1n,
      0,
      0,
      ZERO,
      pad(depositor),
      pad(HANDLER),
      ZERO,
      { updatedRecipient: pad(HANDLER), updatedMessageHash: ZERO, updatedOutputAmount: 1n, fillType: 0 },
    ]
  )
  return {
    address: '0x09aea4b2242abc8bb4bb78d537a67a245a7bec64',
    topics: topics as Log['topics'],
    data,
    blockNumber: '0x1',
    transactionHash: '0x1',
  }
}

const transferLog: Log = {
  address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  topics: [toEventSelector('Transfer(address,address,uint256)'), ZERO, ZERO],
  data: ZERO,
  blockNumber: '0x1',
  transactionHash: '0x1',
}

const clientWith = (logs: Log[]) => ({ getReceiptLogs: () => Promise.resolve(logs) }) as unknown as EvmLogClient

describe('isTreasuryDeposit', () => {
  it("flags a fill a treasury deposited, whichever chain's treasury it was", async () => {
    expect(await isTreasuryDeposit('0x1', clientWith([transferLog, fill(DAO_TREASURY_ARBITRUM as Hex)]))).toBe(true)
  })

  it('flags a batch where any fill is a treasury deposit', async () => {
    expect(await isTreasuryDeposit('0x1', clientWith([fill(USER), fill(DAO_TREASURY_ARBITRUM as Hex)]))).toBe(true)
  })

  it("passes a user's fill", async () => {
    expect(await isTreasuryDeposit('0x1', clientWith([transferLog, fill(USER)]))).toBe(false)
  })

  it('passes a tx with no fill', async () => {
    expect(await isTreasuryDeposit('0x1', clientWith([transferLog]))).toBe(false)
  })
})
