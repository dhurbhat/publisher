import { Capability } from "iso-ucan/capability"
import { z } from "zod"
import * as fs from 'fs'
import { EdDSASigner } from "iso-signatures/signers/eddsa.js"
import { Store } from "iso-ucan/store";
import { MemoryDriver } from "iso-kv/drivers/memory.js"
import * as Capabilities from "./src/admin/capabilities"

// const ChapterReadCap = Capability.from({
//     schema: z.object({
//         email: z.email()
//     }),
//     cmd: '/chapter/read',
// });

// const AdminCap = Capability.from({
//     schema: z.object({ action: z.enum(['invite', 'revoke', 'list'])}),
//     cmd: '/admin',
// })

/**
 * Parses CLI arguments natively for the batch list and local environment execution flag.
 * Example: npx tsx delegate-worker.ts [--author path-to-author-seed-file [| ../author_private.seed]] [--admin admin-worker-private [| ../admin_worker_private.seed]] [--worker worker-private-key-path [| ../worker_private.seed]] [--local]
 */
function parseArgs(): { authorSeedPath: string, adminWorkerSeedPath: string, workerSeedPath: string } {
    const args = process.argv.slice(2)
    let authorSeedPath = "../author_private.seed"
    let adminWorkerSeedPath = "../admin_worker_private.seed"
    let workerSeedPath = "../worker_private.seed"

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--author' && args[i + 1]) authorSeedPath = args[i + 1]
        if (args[i] === '--admin' && args[i + 1]) adminWorkerSeedPath = args[i + 1]
        if (args[i] === '--worker' && args[i + 1]) workerSeedPath = args[i + 1]
    }
    return { authorSeedPath, adminWorkerSeedPath, workerSeedPath }
}

type LoadResult = [{ secret: string, signer: EdDSASigner }, null] | [null, Error]

async function loadSigner(seedPath: string): Promise<LoadResult> {
    if (!fs.existsSync(seedPath)) {
        return [null, new Error(`❌ Error: ${seedPath} file missing!`)]
    }
    try {
        const secret = fs.readFileSync(seedPath, 'utf8').trim()
        const signer = await EdDSASigner.import(secret)
        return [{ secret, signer }, null]
    } catch (err) {
        return [null, err instanceof Error ? err : new Error(String(err))]
    }
}

async function inviteWorker() {
    const { authorSeedPath, adminWorkerSeedPath, workerSeedPath } = parseArgs()
    console.log("🔐 Setting up Author → Worker delegation (ONE-TIME)")
    // 1a. Read Author private seed securely from path
    const [author, authorError] = await loadSigner(authorSeedPath)
    if (authorError) {
        console.error(`❌ Error: ${authorError?.message}`)
        return
    }
    const { secret: authorSecret, signer: authorSigner } = author

    // 1b. Read Admin worker private seed securely from path
    const [admin, adminError] = await loadSigner(adminWorkerSeedPath)
    if (adminError) {
        console.error(`❌ Error: ${adminError?.message}`)
        return
    }
    const { secret: adminSecret, signer: adminWorkerSigner } = admin

    // 1c. Read (Chapter) Worker private seed securely from path
    const [worker, workerError] = await loadSigner(workerSeedPath)
    if (workerError) {
        console.error(`❌ Error: ${workerError?.message}`)
        return
    }
    const { secret: workerSecret, signer: workerSigner } = worker

    const store = new Store(new MemoryDriver())

    // 2. Delegate to (Chapter) worker
    const delegation = await Capabilities.ChapterReadCap.delegate({
        iss: authorSigner,
        aud: workerSigner.did,
        sub: authorSigner.did,
        pol: [],
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365),
        store: store
    })
    // 3. Delegate Admin authority to Admin worker
    const adminDelegation = await Capabilities.AdminCap.delegate({
        iss: authorSigner,
        aud: adminWorkerSigner.did,
        sub: authorSigner.did,
        pol: [],
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365),
        store: store
    })
    // 4. save delegation JWT to a file
    await store.driver.set('author-worker-delegation', delegation)
    fs.writeFileSync('../author-worker-delegation.jwt', delegation.toString(), 'utf8')

    await store.driver.set('admin-worker-delegation', adminDelegation)
    fs.writeFileSync('../admin-worker-delegation', adminDelegation.toString(), 'utf8')
    console.log("✅ Author → Worker delegation created!");
    console.log(`   Author DID: ${authorSigner.did}`);
    console.log(`   Worker DID: ${workerSigner.did}`);
    console.log(`   ChapterReadCap Delegation saved to: ../author-worker-delegation.jwt`);
    console.log(`   AdminCap Delegation saved to: ../admin-worker-delegation.jwt`);
    console.log(`   Expires: ${new Date(delegation.exp! * 1000).toISOString()}`);

    // 5. Also store it in Cloudflare KV for the Worker to access
    // (You'd need a Cloudflare KV binding for this, or use Secrets)
    // The Worker should have this delegation available to prove its authority

    // 6. IMPORTANT: This JWT should be stored as a Cloudflare Secret
    // or in KV so the Worker can use it as proof
    console.log("\n📋 NEXT STEPS:");
    console.log("1. Store the worker ChapterReadCap delegation in Cloudflare Secrets or KV:");
    console.log(`   echo "${delegation.toString()}" | npx wrangler secret put AUTHOR_WORKER_DELEGATION`);
    console.log("2. Store the AdminCap delegation in Cloudflare Secrets or KV:");
    console.log(`   echo "${adminDelegation.toString()}" | npx wrangler secret put AUTHOR_ADMIN_WORKER_DELEGATION`);
    console.log("3. Or store it in KV:");
    console.log("   (via Worker API or Cloudflare dashboard)");
}

inviteWorker()
