import { Store } from 'iso-ucan/store'  
import { IdbDriver } from 'iso-kv/drivers/idb.js'  
  
// Confirmed: IdbDriver wraps idb-keyval, which talks to the browser's  
// native `indexedDB` global directly — works in any real browser tab,  
// no LocalForage needed.  
export const ucanStore = new Store(new IdbDriver({ name: 'reviewer-ucan' }))  
export const rawIdb = new IdbDriver({ name: 'reviewer-session' }) // for signer/email/DIDs
