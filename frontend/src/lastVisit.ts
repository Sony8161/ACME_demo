const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const key = (userId: string) => `pm.lastVisit.${userId}`

/** When this person last pressed "Got it" on the changes card, kept in this browser. A week ago if they never did (or storage is unavailable). */
export function readLastVisit(userId: string, now: Date = new Date()): Date {
  try {
    const stored = localStorage.getItem(key(userId))
    if (stored) {
      const when = new Date(stored)
      if (!Number.isNaN(when.getTime())) return when
    }
  } catch {
    // storage blocked: fall through to the default
  }
  return new Date(now.getTime() - WEEK_MS)
}

export function markVisited(userId: string, now: Date = new Date()): void {
  try {
    localStorage.setItem(key(userId), now.toISOString())
  } catch {
    // storage blocked: the card just shows the last week again next time
  }
}
