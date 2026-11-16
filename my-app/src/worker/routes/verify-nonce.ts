import { Hono } from 'hono'
import { EdDSASigner } from 'iso-signatures/signers/eddsa.js'
import { Store } from 'iso-ucan/store'
import { CloudflareUcanStore } from '../cloudflare-ucan-store.js'
import { ChapterCap } from '../../shared/chapter-cap.js'
import type { Bindings } from '../../index.js'
import { parse } from 'iso-did'
import { AuthorizeRequestSchema } from '../../shared/schemas.js'
import { zValidator } from '@hono/zod-validator'
import { Delegation } from 'iso-ucan/delegation'
import { codec } from 'zod'

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

    // New device registers its DID -> gets a 6-digit code (lazy: only on click)  
    app.post('/api/link/request', async (c) => {
        const { did } = await c.req.json()
        if (typeof did !== 'string' || !did.startsWith('did:')) {
            return c.json({ error: 'invalid did' }, 400)
        }
        const old = await c.env.READER_SESSION_KV.get(`linkreq-code-for:${did}`)
        if (old) await c.env.READER_SESSION_KV.delete(`linkcode:${old}`)
        const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000))
        await c.env.READER_SESSION_KV.put(`linkcode:${code}`, did, { expirationTtl: 300 })
        // NEW: reverse mapping so /api/link/approve can find & delete the code  
        await c.env.READER_SESSION_KV.put(`linkreq-code-for:${did}`, code, { expirationTtl: 300 })
        return c.json({ code })
    })

    // Old device resolves code -> did; added rate-limit
    app.get('/api/link/lookup/:code', async (c) => {
        const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
        const rlKey = `rl-lookup:${ip}`
        const attempts = Number(await c.env.READER_SESSION_KV.get(rlKey) ?? 0)
        if (attempts >= 10)
            return c.json({ error: 'too many attempts' }, 429)
        await c.env.READER_SESSION_KV.put(rlKey, String(attempts + 1), { expirationTtl: 300 })

        const did = await c.env.READER_SESSION_KV.get(`linkcode:${c.req.param('code')}`)
        if (!did) return c.json({ error: 'expired or invalid code' }, 404)
        return c.json({ did })
    })

    // Old device uploads the minted R1->R2 delegation  
    app.post('/api/link/approve', async (c) => {
        const { token, parentDelegation, did, email } = await c.req.json()
        let d, pd
        try {
            d = await Delegation.fromString(token)
            pd = await Delegation.fromString(parentDelegation)
        } catch {
            return c.json({ error: 'invalid delegation' }, 400)
        }
        if (typeof did !== 'string' || !did.startsWith('did:') || typeof email !== 'string')
            return c.json({ error: 'invalid request' }, 400)
        const authorDID = parse(c.env.AUTHOR_DID).did
        const now = Math.floor(Date.now() / 1000)

        if (parse(d.aud).did !== parse(did).did) return c.json({ error: 'aud mismatch' }, 400)
        // FIX: a link code must be actually pending for this DID
        const pending = await c.env.READER_SESSION_KV.get(`linkreq-code-for:${did}`)
        if (!pending) return c.json({ error: 'no pending link request' }, 403)
        // (b2) NEW: subject must be the author on BOTH links, and neither expired  
        if (!pd.sub || !d.sub || parse(pd.sub).did !== authorDID || parse(d.sub).did !== authorDID)
            return c.json({ error: 'wrong subject' }, 403)
        if (!pd.exp || !d.exp || pd.exp <= now || d.exp <= now)
            return c.json({ error: 'expired delegation' }, 403)
        // FIX: verify the parent delegation is a real Worker->Reviewer chain  
        // rooted at AUTHOR_DID, and that d.iss === pd.aud (R1 delegates to R2)  
        if (parse(pd.iss).did !== c.env.WORKER_DID || parse(d.iss).did !== parse(pd.aud).did)
            return c.json({ error: 'invalid proof chain' }, 403)

        // FIX: pin email to the delegation policy, not the request body 
        const expectedPolicy = JSON.stringify([['==', '.email', email]])
        
        if (JSON.stringify(d.pol) !== expectedPolicy) return c.json({ error: 'email mismatch' }, 403)

        const store = new Store(new CloudflareUcanStore(c.env.UCAN_STORE_KV))
        const awDelegation = await Delegation.fromString(c.env.AUTHOR_WORKER_DELEGATION)

        await store.add([awDelegation, pd, d])   // seed A->W (as in verify-nonce) + R1->R2  
        await c.env.READER_SESSION_KV.put(`linkgrant:${did}`,
            JSON.stringify({ token, parentToken: parentDelegation, email, code: pending }), { expirationTtl: 300 })
        await c.env.READER_SESSION_KV.delete(`linkcode:${pending}`)
        await c.env.READER_SESSION_KV.delete(`linkreq-code-for:${did}`)
        return c.json({ ok: true })
    })

    // New device polls for the grant  
    app.get('/api/link/claim/:did', async (c) => {
        const did = c.req.param('did')
        const code = c.req.query('code')                    // FIX: query, not param  
        const raw = await c.env.READER_SESSION_KV.get(`linkgrant:${did}`)
        if (!raw) return c.json({ pending: true, token: null })
        const { token, parentToken, email, code: expected } = JSON.parse(raw)
        if (!code || code !== expected)                     // FIX: compare to grant's code  
            return c.json({ error: 'forbidden' }, 403)
        await c.env.READER_SESSION_KV.delete(`linkgrant:${did}`)
        return c.json({
            pending: false, token, parentToken, email,
            authorWorkerDelegation: c.env.AUTHOR_WORKER_DELEGATION,
            authorDID: c.env.AUTHOR_DID, workerDID: c.env.WORKER_DID
        })
    })
}