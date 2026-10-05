import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Item = {
  id: string
  kind: 'informal' | 'formal'
  dataset: string
  title: string | null
  statement: string
  source_id: string | null
  formal_statement: string | null
  n_proofs: number
  file: 'informal.jsonl' | 'formal.jsonl'
  byte_offset: number
  byte_length: number
}

type CollectionIndex = {
  sources: { kind: 'informal' | 'formal'; dataset: string; count: number }[]
  items: Item[]
  position: Record<string, number>
}

const collection = JSON.parse(readFileSync(join(process.cwd(), 'api', 'collection-index.json'), 'utf8')) as CollectionIndex
const pageSize = 1

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function numberValue(value: string): number {
  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) ? Math.min(10_000, Math.max(1, number)) : 1
}

function responseJson(response: any, status: number, body: unknown) {
  response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  return response.status(status).json(body)
}

function matches(item: Item, query: string): boolean {
  if (!query) return true
  const haystack = [item.statement, item.title, item.source_id, item.formal_statement].filter(Boolean).join(' ').toLocaleLowerCase()
  return query.split(/\s+/).every((term) => haystack.includes(term))
}

function blobUrl(file: Item['file']): string | undefined {
  return file === 'informal.jsonl' ? process.env.COLLECTION_INFORMAL_URL : process.env.COLLECTION_FORMAL_URL
}

export default async function handler(request: any, response: any) {
  const route = queryValue(request.query.route)
  const id = queryValue(request.query.id)

  if (route === 'stats') {
    return responseJson(response, 200, { sources: collection.sources, total: collection.items.length })
  }
  if (route === 'position') {
    const page = collection.position[id]
    return page ? responseJson(response, 200, { page }) : responseJson(response, 404, { error: 'Record not found' })
  }
  if (route === 'items') {
    const query = queryValue(request.query.q).trim().toLocaleLowerCase().slice(0, 160)
    const dataset = queryValue(request.query.dataset) || 'all'
    const kind = queryValue(request.query.kind) || 'all'
    const page = numberValue(queryValue(request.query.page) || '1')
    const items = collection.items.filter((item) => (dataset === 'all' || item.dataset === dataset) && (kind === 'all' || item.kind === kind) && matches(item, query))
    return responseJson(response, 200, {
      total: items.length,
      page,
      page_size: pageSize,
      items: items.slice((page - 1) * pageSize, page * pageSize).map(({ file, byte_offset, byte_length, source_id, formal_statement, ...item }) => item),
    })
  }
  if (route === 'item') {
    const item = collection.items.find((candidate) => candidate.id === id)
    if (!item) return responseJson(response, 404, { error: 'Record not found' })
    const url = blobUrl(item.file)
    if (!url) return responseJson(response, 503, { error: 'Collection storage is not configured' })
    try {
      const blobResponse = await fetch(url, { headers: { Range: `bytes=${item.byte_offset}-${item.byte_offset + item.byte_length - 1}` } })
      if (!blobResponse.ok) throw new Error(`Blob request failed (${blobResponse.status})`)
      const detail = JSON.parse(await blobResponse.text())
      return responseJson(response, 200, detail)
    } catch (error) {
      return responseJson(response, 502, { error: error instanceof Error ? error.message : 'Could not read collection record' })
    }
  }
  return responseJson(response, 404, { error: 'Endpoint not found' })
}
