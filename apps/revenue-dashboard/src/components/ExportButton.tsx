import { useState, useEffect, useRef } from 'react'

import { copyToClipboard, downloadCSV, formatAsCSV, formatAsTSV } from '../utils/export'

type ExportButtonProps = {
  headers: string[]
  rows: string[][]
  filename: string
}

export function ExportButton({ headers, rows, filename }: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showCopied, setShowCopied] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscapeKey)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscapeKey)
    }
  }, [isOpen])

  const handleCopyToClipboard = async () => {
    try {
      const tsv = formatAsTSV(headers, rows)
      await copyToClipboard(tsv)
      setShowCopied(true)
      setIsOpen(false)
      setTimeout(() => setShowCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
    }
  }

  const handleDownloadCSV = () => {
    const csv = formatAsCSV(headers, rows)
    downloadCSV(csv, filename)
    setIsOpen(false)
  }

  const isDisabled = rows.length === 0

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isDisabled}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        className={`
          px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
          flex items-center gap-1.5
          ${
            isDisabled
              ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed opacity-50'
              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 border border-zinc-700'
          }
        `}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        Export
        <svg
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-56 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg z-10"
          role="menu"
          aria-orientation="vertical"
        >
          <div className="py-1">
            <button
              onClick={() => void handleCopyToClipboard()}
              role="menuitem"
              className="w-full px-4 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Copy to Clipboard
            </button>
            <button
              onClick={handleDownloadCSV}
              role="menuitem"
              className="w-full px-4 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Download CSV
            </button>
          </div>
        </div>
      )}

      {showCopied && (
        <div className="absolute right-0 -top-10 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg shadow-lg">
          Copied!
        </div>
      )}
    </div>
  )
}
