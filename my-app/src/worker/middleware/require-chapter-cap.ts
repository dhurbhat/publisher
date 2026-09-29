import type { Context, Next } from 'hono'  
import { Invocation } from 'iso-ucan/invocation'  
import { Store } from 'iso-ucan/store'  
import { Resolver } from 'iso-signatures/verifiers/resolver.js'  
import * as EdDSA from 'iso-signatures/verifiers/eddsa.js'  
import { base64 } from 'iso-base/rfc4648'  
import { parse as didParse } from 'iso-did'  
import { CloudflareUcanStore } from '../cloudflare-ucan-store.js'  
import type { Capability } from 'iso-ucan/capability'  
import { Bindings } from '../../index.js'

export interface ChapterVars {
    Variables: {
        invocation: Invocation,
        chapterArgs: {
            email: string,
            slug: string,
        }
    }
}
const verifierResolver = new Resolver({ ...EdDSA.verifier })  
  
/**  
 * Generic middleware factory: verifies a base64-encoded Invocation against  
 * `cap`, resolving every proof from the server's own persistent Store  
 * (never from the request body), and asserts the resolved root delegation's  
 * issuer is the pinned AUTHOR_DID.  
 */  
export function requireChapterCap(cap: Capability<any, string>) {  
  return async (c: Context<{ Bindings: Bindings} & ChapterVars>, next: Next) => {  
    let body: { invocation: string }  
    try {  
      body = await c.req.json()  
    } catch {  
      return c.json({ error: 'invalid body' }, 400)  
    }  
  
    const store = new Store(new CloudflareUcanStore(c.env.UCAN_STORE_KV))  
  
    try {  
      const bytes = base64.decode(body.invocation)  
  
      const invocation = await Invocation.from({  
        bytes,  
        verifierResolver,  
        resolveProof: (cid) => store.resolveProof(cid),  
      })  
  
      // Trust anchor check: assertProofs only guarantees the root is  
      // self-signed, not that it's *your* author. Enforce that explicitly.  
      const root = invocation.delegations[0]  
      if (!root || didParse(root.iss).did !== c.env.AUTHOR_DID) {  
        return c.json({ error: 'untrusted root delegation' }, 403)  
      }  
  
      if (invocation.payload.cmd !== cap.cmd) {  
        return c.json({ error: 'command mismatch' }, 403)  
      }  
  
      const result = await cap.validate(invocation.payload.args)  
      if (result.issues) {  
        return c.json({ error: 'invalid args', issues: result.issues }, 400)  
      }  
      c.set('invocation', invocation)  
      c.set('chapterArgs', result.value)  
    } catch (error) {  
      return c.json(  
        { error: 'invocation verification failed', message: String(error) },  
        401  
      )  
    }  
  
    await next()  
  }  
}