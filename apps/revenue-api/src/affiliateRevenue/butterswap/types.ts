export type TokenListResponse = {
  errno: number
  message: string
  data: {
    items: Array<{ address: string; symbol: string }>
    total: number
  }
}
