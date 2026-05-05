import { STARKNET_CHAIN_ID } from '../constants'

export const DAO_STARKNET_TREASURY_ADDRESSES = [
  '0x052a1132ea4db81bde863afb18a4d4ce5de9d3efdfda6b3daa6484e26425d467',
  '0x07ac2252f2da7cbf085e7a5ddc1318243aa818607cdd430dd2e17dd5d487606a',
]

// AVNU Exchange contract (sends affiliate fees) - pre-normalized
export const AVNU_EXCHANGE = '0x04270219d365d6b017231b52e92b3fb5d7c8378b05e9abc97724537a80e93b0f'

// Transfer event selector (keccak256("Transfer"))
export const TRANSFER_SELECTOR = '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9'

// Starknet RPC endpoint
export const STARKNET_RPC_URL = 'https://rpc.starknet.lava.build'

// Starknet block time (calculated from recent blocks: ~2.7s)
export const STARKNET_BLOCK_TIME_SECONDS = 2.7

// Block estimation buffer (~5 minutes worth of blocks to account for variance)
const BUFFER_SECONDS = 300 // 5 minutes
export const BLOCK_ESTIMATION_BUFFER = Math.floor(BUFFER_SECONDS / STARKNET_BLOCK_TIME_SECONDS) // ~111 blocks

export { STARKNET_CHAIN_ID }
