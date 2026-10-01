import { Hono } from 'hono'
import { EdDSASigner } from 'iso-signatures/signers/eddsa.js'
import { Store } from 'iso-ucan/store'
import { CloudflareUcanStore } from '../cloudflare-ucan-store.js'
import { ChapterCap } from '../../shared/chapter-cap.js'
import type { Bindings } from '../../index.js'
import { parse } from 'iso-did'
import { AuthorizeRequestSchema } from '../../shared/schemas.js'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'
import { Delegation } from 'iso-ucan/delegation'

export function registerSessionRoutes(app: Hono<{ Bindings: Bindings }>) {
    app.post('/api/verify-nonce', zValidator('json', AuthorizeRequestSchema), async (c) => {
        const { reviewerDid, reviewerEmail, nonce } = await c.req.valid('json')

        if (!reviewerDid || !reviewerEmail || !nonce) {
            return c.json({ message: 'Missing fields' }, 400)
        }

        // 5a) look up the email stored against this nonce  
        const storedEmail = await c.env.READER_SESSION_KV.get(`invite:${nonce}`)
        if (!storedEmail || storedEmail !== reviewerEmail) {

            return c.json({ message: 'Invalid nonce or email' }, 401)
        }

        // Consume the nonce so it can't be replayed.  
        await c.env.READER_SESSION_KV.delete(`invite:${nonce}`)

        // 5b) persistent, KV-backed Store (every delegation ever minted lives here)  
        const store = new Store(new CloudflareUcanStore(c.env.UCAN_STORE_KV))
        // 5b1) Add the out-of-band A->W delegation so proofs can be derived
        const awDelegation = await Delegation.fromString(c.env.AUTHOR_WORKER_DELEGATION)
        await store.add([awDelegation]) // << OK to do this on each nonce verification as the 
        console.log(`[api] wrote ${awDelegation.cid.toString()} to UCAN STORE`)

        const workerSigner = await EdDSASigner.import(c.env.WORKER_PRIVATE_KEY)
        const authorDid = parse(c.env.AUTHOR_DID).did
        const receivedReviewerDID = parse(reviewerDid).did

        // 5c) mint Worker -> Reviewer, rooted at Author (sub = authorDid).  
        // cmd is the *parent* '/chapter' so it covers list + read.  
        const delegation = await ChapterCap.delegate({
            iss: workerSigner,
            aud: receivedReviewerDID,
            sub: authorDid,
            pol: [['==', '.email', reviewerEmail]],
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
            store,
        })

        // 5d) client needs authorDid too, to set `sub` on its own invocations.  
        return c.json({
            authorWorkerDelegation: c.env.AUTHOR_WORKER_DELEGATION,
            delegationToken: delegation.toString(),
            workerDID: workerSigner.did,
            authorDID: authorDid,
        })
    })
}