import { createRpcCaller } from '../utils/rpcCall'

import { MAP_RPC_URL } from './constants'

export const rpcCall = createRpcCaller(MAP_RPC_URL, 10000)
