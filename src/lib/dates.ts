const pad = (n: number) => String(n).padStart(2, '0')

/** Local calendar day as `YYYY-MM-DD`. These keys sort chronologically as strings. */
export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function fromKey(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

export const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
