import type { KVNamespace } from '@cloudflare/workers-types'  
import type { DriverAsync } from 'iso-kv/types'  
  
/**  
 * iso-kv Driver backed by a Cloudflare KVNamespace binding.  
 * Values received here are already iso-kv's internal envelope  
 * ({ value, expires }), not raw Delegation bytes — never assume a shape,  
 * just round-trip through JSON.  
 */  
export class CloudflareUcanStore implements DriverAsync {  
  private prefix = 'ucan:'  
  
  constructor(private kv: KVNamespace) {  
    if (!kv) {  
      throw new Error('UCAN_STORE_KV binding is missing or undefined.')  
    }  
  }  
  
  private k(key: string): string {  
    return `${this.prefix}${key}`  
  }  
  
  async has(key: string): Promise<boolean> {  
    return (await this.kv.get(this.k(key))) !== null  
  }  
  
  async get(key: string): Promise<unknown> {  
    return (await this.kv.get(this.k(key), { type: 'json' })) ?? undefined  
  }  
  
  async set(key: string, value: unknown): Promise<this> {  
    // `value` here is iso-kv's `{ value, expires }` wrapper (see KV#set),  
    // not the raw delegation string/bytes.  
    const expiration =  
      value && typeof value === 'object' && 'expires' in value  
        ? (value as { expires: number | null }).expires  
        : null  
  
    await this.kv.put(this.k(key), JSON.stringify(value), {  
      expiration: expiration ?? undefined,  
    })  
    return this  
  }  
  
  async delete(key: string): Promise<void> {  
    await this.kv.delete(this.k(key))  
  }  
  
  async clear(): Promise<void> {  
    let cursor: string | undefined  
    do {  
      const list = await this.kv.list({ prefix: this.prefix, cursor })  
      await Promise.all(list.keys.map((k) => this.kv.delete(k.name)))  
      cursor = list.list_complete ? undefined : list.cursor  
    } while (cursor)  
  }  
  
  async *[Symbol.asyncIterator](): AsyncIterableIterator<[string, unknown]> {  
    let cursor: string | undefined  
    do {  
      const list = await this.kv.list({ prefix: this.prefix, cursor })  
      for (const k of list.keys) {  
        const originalKey = k.name.slice(this.prefix.length)  
        const value = await this.get(originalKey)  
        if (value !== undefined) yield [originalKey, value]  
      }  
      cursor = list.list_complete ? undefined : list.cursor  
    } while (cursor)  
  }  
}