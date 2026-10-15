import { useState } from 'react'
import { IconButton, InputAdornment, TextField, type TextFieldProps } from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'

/** A password box with a button that shows or hides what was typed. Hidden again on every fresh mount. */
export function PasswordField({ label, slotProps, ...props }: TextFieldProps & { label: string }) {
  const [shown, setShown] = useState(false)
  const name = label.toLowerCase()
  return (
    <TextField
      {...props}
      label={label}
      type={shown ? 'text' : 'password'}
      slotProps={{
        ...slotProps,
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                type="button" edge="end" aria-label={`${shown ? 'Hide' : 'Show'} ${name}`} aria-pressed={shown}
                onClick={() => setShown((s) => !s)} sx={{ width: 44, height: 44 }}
              >
                {shown ? <VisibilityOffIcon /> : <VisibilityIcon />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  )
}
