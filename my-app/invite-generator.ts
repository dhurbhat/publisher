import * as fs from 'fs'
import { Capability } from 'iso-ucan/capability';
import { EdDSASigner } from 'iso-signatures/signers/eddsa.js';
import crypto from 'crypto';
import { z } from 'zod';
import { Store } from 'iso-ucan/store'                // Added import
import { MemoryDriver } from 'iso-kv/drivers/memory.js'  // Added import


// Config block - Other authors replace these with their own production edge credentials
const CLOUDFLARE_ZONE_URL = process.env.CLOUDFLARE_ZONE_URL || "https://workers.dev";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "YOUR_CLOUDFLARE_API_TOKEN";
const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID || "YOUR_PRODUCTION_READER_SESSION_KV_ID";
const ACCOUNT_ID = process.env.ACCOUNT_ID || "YOUR_CLOUDFLARE_ACCOUNT_ID";

// FIXED: Using z.unknown() ensures the internal map initialization inside iso-ucan doesn't throw a 'Cannot read properties of undefined (reading 'add')' crash.
const ChapterReadCap = Capability.from({
    schema: z.unknown(),
    cmd: '/chapter/read',
});

/**
 * Parses CLI arguments natively for the batch list and local environment execution flag.
 * Example: npx tsx invite-generator.ts --emails bob@email.com,lucy@email.com [--local]
 */
function parseArgs(): { authorSeedPath: string, emails: string[], isLocalTesting: boolean } {
    const args = process.argv.slice(2);
    let emailsStr = "";
    let isLocalTesting = false;
    let authorSeedPath = "../author_private.seed";

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--emails' && args[i + 1]) emailsStr = args[i + 1];
        if (args[i] === '--local') isLocalTesting = true;
        if (args[i] === '--seed' && args[i + 1]) authorSeedPath = args[i + 1];
    }

    if (!emailsStr) {
        console.error("❌ Error: Missing arguments.");
        console.log("📝 Usage: npx tsx invite-generator.ts --emails <email1,email2...> [--seed <path_to_seed_file>] [--local]");
        process.exit(1);
    }

    const emails = emailsStr.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    return { authorSeedPath, emails, isLocalTesting };
}

async function runBatchInviteGenerator() {
    const { authorSeedPath, emails, isLocalTesting } = parseArgs();

    console.log(`🚀 Starting generic batch invite generation... Using seed file: ${authorSeedPath}`);
    console.log(`👥 Target readers (${emails.length}): ${emails.join(', ')}\n`);

    // 1. Read private seed securely from parent directory
    if (!fs.existsSync('../author_private.seed')) {
        console.error("Error: ../author_private.seed file missing!")
        return
    }
    const secretHex = fs.readFileSync(authorSeedPath, 'utf8').trim()
    // 2. Initialize your local signing authority engine cleanly
    const authorSigner = await EdDSASigner.import(secretHex)

    const store = new Store(new MemoryDriver())

    for (const email of emails) {
        try {
            console.log(`------------------------------------------------------`);
            console.log(`🔐 Processing: ${email}...`);

            // Generate unique decentralized identifier for the friend
            const friendKeyPair = await EdDSASigner.generate();

            // Generate a pure numeric 6-digit nonce to completely bypass Safari auto-correct and smart-punctuation crashes
            const nonce = crypto.randomInt(100000, 999999).toString();

            // Mint the official EdDSA UCAN delegation capability
            const delegation = await ChapterReadCap.delegate({
                iss: authorSigner,            // Author's root signing authority
                aud: friendKeyPair.did,
                sub: authorSigner.did,
                pol: [],
                exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 90), // 90 Days active
                store: store
            });

            const ucanArchiveToken = delegation.toString();
            console.log(`📝 Generated UCAN for ${email}: ${ucanArchiveToken} ${nonce} ${isLocalTesting}`);
            // Build storage package bundle. Only includes the UCAN bearer token and the numeric PIN.
            // Client private keys are completely omitted since readers are text consumers, not token authors.
            const kvPayload = JSON.stringify({
                nonce,
                ucan: ucanArchiveToken
            });

            let cfResponse;

            if (isLocalTesting) {
                // FIXED: Forward the save command straight to your local Hono endpoint router
                cfResponse = await fetch(`http://localhost:8787/api/store-seed-nonce`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, payload: kvPayload })
                });
            } else {
                // Production: Write to live Cloudflare network using global API keys
                cfResponse = await fetch(`https://cloudflare.com{ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/nonce:${email}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'text/plain' },
                    body: kvPayload
                });
            }

            if (!cfResponse.ok) {
                throw new Error(`Cloudflare KV API rejected request: ${cfResponse.statusText}`);
            }

            // Output explicit activation targets for the author to build links or QR layouts
            const baseDomain = isLocalTesting ? 'http://localhost:8787' : CLOUDFLARE_ZONE_URL;
            const activationUrl = `${baseDomain}/?email=${encodeURIComponent(email)}`;

            console.log(`✅ Success for ${email}!`);
            console.log(`🔗 Link for QR Builder:  ${activationUrl}`);
            console.log(`🔢 6-Digit Nonce:       [ ${nonce} ]`);

        } catch (error: any) {
            console.error(`❌ Failed to provision invite for ${error.message}`);
        }
    }

    console.log(`\n======================================================`);
    console.log(`🏁 Batch Invite Processing Complete!`);
    console.log(`======================================================\n`);
}

// Fire execution sequence
runBatchInviteGenerator();
