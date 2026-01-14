export const formatAsCSV = (headers: string[], rows: string[][]): string => {
  const escapeCell = (cell: string): string => {
    if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
      return `"${cell.replace(/"/g, '""')}"`
    }
    return cell
  }

  const csvHeaders = headers.map(escapeCell).join(',')
  const csvRows = rows.map(row => row.map(escapeCell).join(',')).join('\n')
  return `${csvHeaders}\n${csvRows}`
}

export const formatAsTSV = (headers: string[], rows: string[][]): string => {
  const tsvHeaders = headers.join('\t')
  const tsvRows = rows.map(row => row.join('\t')).join('\n')
  return `${tsvHeaders}\n${tsvRows}`
}

export const copyToClipboard = async (text: string): Promise<void> => {
  await navigator.clipboard.writeText(text)
}

export const downloadCSV = (csv: string, filename: string): void => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
