// worker/cloudflare-ucan-store.ts  
 
/**  
 * iso-kv doesn't re-export its Driver types (index.js uses them only via  
 * JSDoc), so we declare the async contract locally — verbatim from  
 * iso-kv/src/types.ts.  
 */  
interface DriverAsync {  
  get: (key: string) => Promise<unknown>  
  has: (key: string) => Promise<boolean>  
  set: (key: string, value: unknown) => Promise<DriverAsync>  
  delete: (key: string) => Promise<void>  
  clear: () => Promise<void>  
  [Symbol.asyncIterator]: () => AsyncIterableIterator<[string, unknown]>  
}  
  
/**  
 * Shape `KV` wraps every value in before calling the driver:  
 *   driver.set(joinedKey, { value, expires })  
 * `expires` is unix seconds or null.  
 */  
interface KVStoredValue {  
  value: unknown  
  expires: number | null  
}  
  
function isStoredValue(v: unknown): v is KVStoredValue {  
  return (  
    typeof v === 'object' && v !== null && 'value' in v && 'expires' in v  
  )  
}  
  
export class CloudflareUcanStore implements DriverAsync {  
  private prefix = 'ucan:'  
  
  constructor(private kv: KVNamespace) {  
    if (!kv) {  
      throw new Error('Cloudflare UCAN_STORE_KV binding is missing or undefined.')  
    }  
  }  
  
  private k(key: string): string {  
    return `${this.prefix}${key}`  
  }  
  
  async get(key: string): Promise<unknown> {  
    const raw = await this.kv.get(this.k(key), { type: 'text' })  
    if (raw === null) return undefined  
    // Return the { value, expires } envelope as-is — KV.#maybeExpire unwraps it.  
    return JSON.parse(raw)  
  }  
  
  async has(key: string): Promise<boolean> {  
    return (await this.kv.get(this.k(key), { type: 'text' })) !== null  
  }  
  
  async set(key: string, value: unknown): Promise<this> {  
    if (!isStoredValue(value)) {  
      throw new TypeError(  
        'CloudflareUcanStore expects the iso-kv { value, expires } envelope'  
      )  
    }  
    // Map expires → native CF KV expiration (unix seconds) so delegation  
    // TTLs physically evict; KV also lazily expires via #maybeExpire.  
    const opts =  
      typeof value.expires === 'number' ? { expiration: value.expires } : {}  
    await this.kv.put(this.k(key), JSON.stringify(value), opts)  
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
      for (const { name } of list.keys) {  
        // Must yield the joined key WITHOUT our prefix — KV.split() and  
        // Store.proofs()/chain() reconstruct composite keys from it.  
        const raw = await this.kv.get(name, { type: 'text' })  
        if (raw !== null) {  
          yield [name.slice(this.prefix.length), JSON.parse(raw)]  
        }  
      }  
      cursor = list.list_complete ? undefined : list.cursor  
    } while (cursor)  
  }  
}