import type { Neighborhood } from './domain'

const DATABASE = 'ouliproof-neighborhoods-v1'
const STORE = 'neighborhoods'
const TTL = 60 * 60 * 1000
const MAX_ENTRIES = 120

type Stored = { id: string; savedAt: number; root: Neighborhood['root']; nodes: [string, Neighborhood['root']][]; outgoing: Neighborhood['outgoing'] }

let database: Promise<IDBDatabase | null> | null = null

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (!database) database = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch { resolve(null) }
  })
  return database
}

export async function readNeighborhood(id: string): Promise<Neighborhood | null> {
  const db = await openDatabase()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id)
      request.onsuccess = () => {
        const row = request.result as Stored | undefined
        if (!row || Date.now() - row.savedAt > TTL || !Array.isArray(row.nodes) || !Array.isArray(row.outgoing) || row.root?.id !== id) { resolve(null); return }
        resolve({ root: row.root, nodes: new Map(row.nodes), outgoing: row.outgoing })
      }
      request.onerror = () => resolve(null)
    } catch { resolve(null) }
  })
}

export async function writeNeighborhood(id: string, value: Neighborhood): Promise<void> {
  const db = await openDatabase()
  if (!db) return
  try {
    const transaction = db.transaction(STORE, 'readwrite')
    const store = transaction.objectStore(STORE)
    store.put({ id, savedAt: Date.now(), root: value.root, nodes: [...value.nodes], outgoing: value.outgoing } satisfies Stored)
    // Keep storage bounded without a background task or a server-side dataset.
    const cursor = store.openCursor()
    const rows: { id: string; savedAt: number }[] = []
    cursor.onsuccess = () => {
      const current = cursor.result
      if (current) {
        const row = current.value as Stored
        rows.push({ id: row.id, savedAt: row.savedAt })
        current.continue()
      } else {
        rows.sort((a, b) => b.savedAt - a.savedAt)
        for (const row of rows.slice(MAX_ENTRIES)) store.delete(row.id)
        for (const row of rows.slice(0, MAX_ENTRIES)) if (Date.now() - row.savedAt > TTL) store.delete(row.id)
      }
    }
    await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => resolve(); transaction.onabort = () => resolve() })
  } catch { /* Private browsing and storage quotas must not block the API. */ }
}
