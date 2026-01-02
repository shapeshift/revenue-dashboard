import * as AssetDataService from '../assetData/AssetDataService'

export const assetDataService = {
  ensureLoadedAsync: AssetDataService.ensureLoadedAsync,
  getAsset: AssetDataService.getAsset,
  getAssetDecimals: AssetDataService.getAssetDecimals,
  isLoaded: AssetDataService.isLoaded,
  reload: AssetDataService.reload,
}
