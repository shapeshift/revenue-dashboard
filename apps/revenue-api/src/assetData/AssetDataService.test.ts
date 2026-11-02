import axios from 'axios'
import { afterAll, describe, expect, spyOn, test } from 'bun:test'

import { assetDataService } from './AssetDataService'

const ERC20 = (n: number) => `eip155:1/erc20:0x${String(n).padStart(40, '0')}`

describe('AssetDataService.getAsset', () => {
  const get = spyOn(axios, 'get')
  afterAll(() => get.mockRestore())

  test('one lookup for concurrent callers, and a miss is remembered', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    get.mockRejectedValue(
      new axios.AxiosError('nope', '404', undefined, undefined, {
        status: 404,
      } as never)
    )

    await Promise.all([assetDataService.getAsset(ERC20(1)), assetDataService.getAsset(ERC20(1))])
    await assetDataService.getAsset(ERC20(1))
    warn.mockRestore()

    expect(get).toHaveBeenCalledTimes(1)
  })
})
