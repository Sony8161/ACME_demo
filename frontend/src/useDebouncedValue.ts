import { useEffect, useState } from 'react'

/** A value that follows `value` after it has stopped changing for `delay` ms (a search box becomes one request, not one per letter). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return settled
}
