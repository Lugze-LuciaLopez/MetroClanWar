import { readFile, appendFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'

export class EventStore {
  constructor(storePath) {
    this.path = storePath.endsWith('.jsonl') ? storePath : join(storePath, 'events.jsonl')
  }

  async init() {
    const dir = dirname(this.path)
    await mkdir(dir, { recursive: true })
    if (!existsSync(this.path)) {
      await writeFile(this.path, '', 'utf8')
    }
  }

  async append(event) {
    await appendFile(this.path, JSON.stringify(event) + '\n', 'utf8')
  }

  async readAll() {
    try {
      const text = await readFile(this.path, 'utf8')
      return text
        .split('\n')
        .filter(l => l.trim())
        .map(l => { try { return JSON.parse(l) } catch { return null } })
        .filter(Boolean)
    } catch {
      return []
    }
  }

  async readByWeekId(weekId) {
    const all = await this.readAll()
    return all.filter(e => e.weekId === weekId)
  }

  async readByType(type) {
    const all = await this.readAll()
    return all.filter(e => e.type === type)
  }

  // Returns the set of eventIds already stored (for deduplication)
  async knownIds() {
    const all = await this.readAll()
    return new Set(all.map(e => e.eventId).filter(Boolean))
  }
}
