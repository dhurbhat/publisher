import type { KVNamespace } from '@cloudflare/workers-types'

export class CloudflareUcanStore {
  private prefix = 'ucan:'

  constructor(private kv: KVNamespace) {
    if (!kv) {
      throw new Error('Cloudflare UCAN_STORE_KV binding is missing or undefined.')
    }
  }

  private getPrefixedKey(key: string): string {
    return `${this.prefix}${key}`
  }

  async has(key: string): Promise<boolean> {
    const value = await this.kv.get(this.getPrefixedKey(key), { type: 'arrayBuffer' })
    return value !== null
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const value = await this.kv.get(this.getPrefixedKey(key), { type: 'arrayBuffer' })
    if (!value) return undefined
    return new Uint8Array(value)
  }

  // Adjusted to match `(key: string, value: unknown) => Promise<this>` 
  async set(key: string, value: unknown): Promise<this> {
    // Runtime type-guard validation to ensure UCAN primitives pass valid binary arrays
    if (!(value instanceof Uint8Array)) {
      throw new TypeError('CloudflareUcanStore driver values must be a Uint8Array.')
    }

    const valBuffer = value.byteOffset === 0 && value.buffer.byteLength === value.byteLength 
      ? value.buffer 
      : value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)

    await this.kv.put(this.getPrefixedKey(key), valBuffer as ArrayBuffer)
    return this
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(this.getPrefixedKey(key))
  }

  async clear(): Promise<void> {
    let cursor: string | undefined
    do {
      const list = await this.kv.list({ prefix: this.prefix, cursor })
      const deletePromises = list.keys.map((k) => this.kv.delete(k.name))
      await Promise.all(deletePromises)
      cursor = list.list_complete ? undefined : list.cursor
    } while (cursor)
  }

  async *entries(): AsyncIterableIterator<[string, Uint8Array]> {
    let cursor: string | undefined
    do {
      const list = await this.kv.list({ prefix: this.prefix, cursor })
      for (const key of list.keys) {
        const originalKey = key.name.startsWith(this.prefix)
          ? key.name.slice(this.prefix.length)
          : key.name

        const val = await this.get(originalKey)
        if (val !== undefined) {
          yield [originalKey, val]
        }
      }
      cursor = list.list_complete ? undefined : list.cursor
    } while (cursor)
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<[string, Uint8Array]> {
    return this.entries()
  }
}
