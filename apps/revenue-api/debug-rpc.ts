/**
 * Debug RPC calls to understand the issue
 */

const STARKNET_RPC_URL = 'https://rpc.starknet.lava.build'
const TRANSFER_SELECTOR = '0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9'
const SHAPESHIFT_TREASURY = '0x052a1132ea4db81bde863afb18a4d4ce5de9d3efdfda6b3daa6484e26425d467'

async function testRpcCall(testName: string, params: any) {
  console.log(`\n=== ${testName} ===`)
  console.log('Params:', JSON.stringify(params, null, 2))

  try {
    const response = await fetch(STARKNET_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'starknet_getEvents',
        params: [params],
      }),
    })

    const data = await response.json()

    if (data.error) {
      console.log('❌ Error:', data.error.message)
      if (data.error.data) {
        console.log('   Details:', JSON.stringify(data.error.data))
      }
    } else {
      console.log('✅ Success! Events found:', data.result?.events?.length || 0)
    }
  } catch (error) {
    console.log('❌ Exception:', error)
  }
}

async function main() {
  console.log('Testing different RPC parameter formats...')

  // Test 1: Without address field, simple keys
  await testRpcCall('Test 1: No address, simple keys', {
    from_block: { block_number: 6299840 },
    to_block: { block_number: 6299850 },
    keys: [[TRANSFER_SELECTOR]],
    chunk_size: 10,
  })

  // Test 2: With keys including treasury
  await testRpcCall('Test 2: With treasury filter (no nulls)', {
    from_block: { block_number: 6299840 },
    to_block: { block_number: 6299850 },
    keys: [[TRANSFER_SELECTOR], [SHAPESHIFT_TREASURY]],
    chunk_size: 10,
  })

  // Test 3: With keys array but undefined for middle
  const keysWithUndefined = [[TRANSFER_SELECTOR], undefined, [SHAPESHIFT_TREASURY]]
  await testRpcCall('Test 3: With undefined in keys', {
    from_block: { block_number: 6299840 },
    to_block: { block_number: 6299850 },
    keys: keysWithUndefined,
    chunk_size: 10,
  })

  // Test 4: Omit middle key entirely
  await testRpcCall('Test 4: Keys with empty array for wildcard', {
    from_block: { block_number: 6299840 },
    to_block: { block_number: 6299850 },
    keys: [[TRANSFER_SELECTOR], [], [SHAPESHIFT_TREASURY]],
    chunk_size: 10,
  })

  // Test 5: Two-element keys array (skip from filter)
  await testRpcCall('Test 5: Only event type and to address', {
    from_block: { block_number: 6299840 },
    to_block: { block_number: 6299850 },
    keys: [
      [TRANSFER_SELECTOR],
      [SHAPESHIFT_TREASURY]
    ],
    chunk_size: 10,
  })
}

main().catch(console.error)
