import axios from 'axios'

// const API_URL = 'https://revenue-api.shapeshift.com/api/v1'
const API_URL = 'http://localhost:4200/api/v1' // Testing local

const testDate = '2026-01-31'

async function testEndpoint() {
  console.log(`\n=== Testing Production Endpoint ===`)
  console.log(`URL: ${API_URL}/affiliate/revenue`)
  console.log(`Date: ${testDate}\n`)

  try {
    const { data } = await axios.get(`${API_URL}/affiliate/revenue`, {
      params: {
        startDate: testDate,
        endDate: testDate,
      },
      timeout: 60000,
    })

    console.log(`✓ Request successful!\n`)

    // Overall totals
    console.log(`=== Overall Totals ===`)
    console.log(`Total USD: $${data.totalUsd.toFixed(2)}`)
    console.log(`Total Volume USD: $${data.totalVolumeUsd.toFixed(2)}`)
    console.log(`Total Fee Count: ${data.totalFeeCount}`)
    console.log(`Failed Providers: ${data.failedProviders.length > 0 ? data.failedProviders.join(', ') : 'None'}`)

    // Relay-specific data
    console.log(`\n=== Relay Data ===`)
    console.log(`Revenue: $${data.byService.relay?.toFixed(2) ?? '0.00'}`)
    console.log(`Volume: $${data.byServiceVolume.relay?.toFixed(2) ?? '0.00'}`)
    console.log(`Fee Count: ${data.byServiceFeeCount.relay ?? 0}`)

    // By-date breakdown for Jan 31
    if (data.byDate[testDate]) {
      const dateData = data.byDate[testDate]
      console.log(`\n=== ${testDate} Daily Data ===`)
      console.log(`Total USD: $${dateData.totalUsd.toFixed(2)}`)
      console.log(`Total Volume USD: $${dateData.totalVolumeUsd.toFixed(2)}`)
      console.log(`Total Fee Count: ${dateData.totalFeeCount}`)
      console.log(`Relay Revenue: $${dateData.byService.relay?.toFixed(2) ?? '0.00'}`)
      console.log(`Relay Volume: $${dateData.byServiceVolume.relay?.toFixed(2) ?? '0.00'}`)
      console.log(`Relay Fee Count: ${dateData.byServiceFeeCount.relay ?? 0}`)

      // Asset breakdown for Relay
      if (dateData.byAsset) {
        console.log(`\n=== Relay Assets on ${testDate} ===`)
        const relayAssets = Object.values(dateData.byAsset).filter((asset: any) => asset.byService.relay > 0)

        if (relayAssets.length === 0) {
          console.log(`⚠️  No Relay assets found!`)
        } else {
          console.log(`Found ${relayAssets.length} assets with Relay fees:`)
          relayAssets.forEach((asset: any) => {
            console.log(`\n  Asset: ${asset.symbol} (${asset.assetId})`)
            console.log(`  Chain: ${asset.chainName} (${asset.chainId})`)
            console.log(`  Token Amount: ${asset.tokenAmount}`)
            console.log(`  Amount USD: $${asset.amountUsd.toFixed(6)}`)
            console.log(`  Volume USD: $${asset.volumeUsd.toFixed(2)}`)
            console.log(`  Fee Count: ${asset.feeCount}`)
            console.log(`  Relay USD: $${asset.byService.relay.toFixed(6)}`)
            console.log(`  Relay Fee Count: ${asset.byServiceFeeCount.relay}`)
          })
        }
      }
    } else {
      console.log(`\n⚠️  No data for ${testDate}`)
    }

    // Global asset breakdown
    console.log(`\n=== Global Relay Asset Summary ===`)
    const globalRelayAssets = Object.values(data.byAsset).filter((asset: any) => asset.byService.relay > 0)
    console.log(`Total Relay assets: ${globalRelayAssets.length}`)
    const totalRelayUsd = globalRelayAssets.reduce((sum: number, asset: any) => sum + asset.byService.relay, 0)
    console.log(`Total Relay USD from assets: $${totalRelayUsd.toFixed(2)}`)

    // Comparison
    console.log(`\n=== Comparison ===`)
    console.log(`API Expected (from issue): $110.86`)
    console.log(`Dashboard Shows: $5.48`)
    console.log(`Endpoint Returns: $${data.byService.relay?.toFixed(2) ?? '0.00'}`)
    console.log(`Match Ratio: ${((data.byService.relay / 110.86) * 100).toFixed(1)}%`)

  } catch (error) {
    console.error(`\n❌ Request failed:`)
    if (axios.isAxiosError(error)) {
      console.error(`Status: ${error.response?.status}`)
      console.error(`Data:`, error.response?.data)
    } else {
      console.error(error)
    }
  }
}

testEndpoint()
