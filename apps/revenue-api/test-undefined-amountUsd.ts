// Test what happens when amountUsd is undefined vs string
const fee1 = { amountUsd: undefined }
const fee2 = { amountUsd: "45.71" }

console.log("parseFloat(undefined || '0'):", parseFloat(fee1.amountUsd || '0'))
console.log("parseFloat('45.71' || '0'):", parseFloat(fee2.amountUsd || '0'))

// Test what happens in aggregation
let total = 0
total += parseFloat(fee1.amountUsd || '0')
total += parseFloat(fee2.amountUsd || '0')
console.log("Total:", total)
