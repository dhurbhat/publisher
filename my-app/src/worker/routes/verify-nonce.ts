import { Hono } from 'hono'
import { EdDSASigner } from 'iso-signatures/signers/eddsa.js'
import { Store } from 'iso-ucan/store'
import { CloudflareUcanStore } from '../cloudflare-ucan-store.js'
import { ChapterCap } from '../chapter-cap.js'
// import type { Env } from '../env.js'  
import type { Bindings } from '../index'

export function registerSessionRoutes(app: Hono<{ Bindings: Bindings }>) {
    app.post('/api/verify-nonce', async (c) => {
        const { reviewerDid, reviewerEmail, nonce } = await c.req.json<{
            reviewerDid: string
            reviewerEmail: string
            nonce: string
        }>()

        if (!reviewerDid || !reviewerEmail || !nonce) {
            return c.json({ message: 'Missing fields' }, 400)
        }

        // 5a) look up the email stored against this nonce  
        const storedEmail = await c.env.READER_SESSION_KV.get(nonce)
        if (!storedEmail || storedEmail !== reviewerEmail) {
            return c.json({ message: 'Invalid nonce or email' }, 401)
        }

        // Consume the nonce so it can't be replayed.  
        await c.env.READER_SESSION_KV.delete(nonce)

        // 5b) persistent, KV-backed Store (every delegation ever minted lives here)  
        const store = new Store(new CloudflareUcanStore(c.env.UCAN_STORE_KV))

        const workerSigner = await EdDSASigner.import(c.env.WORKER_PRIVATE_KEY)
        const authorDid = c.env.AUTHOR_DID

        // 5c) mint Worker -> Reviewer, rooted at Author (sub = authorDid).  
        // cmd is the *parent* '/chapter' so it covers list + read.  
        const delegation = await ChapterCap.delegate({
            iss: workerSigner,
            aud: reviewerDid,
            sub: authorDid,
            pol: [['==', '.email', reviewerEmail]],
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
            store,
        })

        // 5d) client needs authorDid too, to set `sub` on its own invocations.  
        return c.json({
            delegationToken: delegation.toString(),
            workerDID: workerSigner.did,
            authorDID: authorDid,
        })
    })
}