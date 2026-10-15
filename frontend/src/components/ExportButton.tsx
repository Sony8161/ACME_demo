import { Button } from '@mui/material'
import DownloadIcon from '@mui/icons-material/FileDownloadOutlined'

/** "Export all 32" when nothing is ticked, "Export 3 selected" when something is. */
export function ExportButton({ selected, total, onClick }: { selected: number; total: number; onClick: () => void }) {
  if (total === 0) return null
  return (
    <Button variant="outlined" size="small" startIcon={<DownloadIcon />} onClick={onClick}>
      {selected > 0 ? `Export ${selected} selected` : `Export all ${total}`}
    </Button>
  )
}
