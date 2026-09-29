import * as fs from 'fs'
import { MemoryDriver } from 'iso-kv/drivers/memory.js'
import { EdDSASigner } from 'iso-signatures/signers/eddsa.js'
import { Store } from 'iso-ucan/store'
import { ChapterCap } from './src/worker/chapter-cap'
import process from 'node:process'

async function uploadSecret(secretName: string, secretValue: string): Promise<boolean> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const workerName = process.env.CLOUDFLARE_WORKER_NAME

  // If environment variables aren't set, return false immediately to trigger fallback
  if (!accountId || !apiToken || !workerName) {
    return false
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}/secrets`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: secretName,
          text: secretValue,
          type: 'secret_text'
        })
      }
    )

    if (!response.ok) {
      console.warn(`API upload for ${secretName} failed with status ${response.status}. Falling back to CLI.`)
      return false
    }

    console.log(`✓ Successfully uploaded ${secretName} to Cloudflare via API!`)
    return true
  } catch (err) {
    console.warn(`API upload error for ${secretName}: ${err}. Falling back to CLI.`)
    return false
  }
}

async function generateSeedAndDelegate() {
  // 1. Generate a brand new cryptographic keypair
  const authorSigner = await EdDSASigner.generate()

  // 2. Export the key as a correctly formatted Multikey string
  const authorSeedString = authorSigner.export()

  // 3. Write the string directly to the parent directory file
  fs.writeFileSync('../author_private.seed', authorSeedString, 'utf8')

  console.log("=== SUCCESS ===")
  console.log("Saved compatible Multikey seed to ../author_private.seed")
  console.log(`Associated Author DID: ${authorSigner.did}`)

  const workerSigner = await EdDSASigner.generate()
  const workerSeedString = workerSigner.export()
  fs.writeFileSync('../worker_private.seed', workerSeedString, 'utf8')
  console.log("=== SUCCESS ===")
  console.log("Saved compatible Multikey seed to ../worker_private.seed")
  console.log(`Associated Worker DID: ${workerSigner.did}`)

  // 4. Delegate ChapterReadCap to worker
  const store = new Store(new MemoryDriver())
  const delegation = await ChapterCap.delegate({
    iss: authorSigner,
    aud: workerSigner.did,
    sub: authorSigner.did,
    pol: [],
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365),
    store: store
  })

  // 5. Save secrets -- try API route, else request user to use command line wrangler.
  if (!await uploadSecret('WORKER_PRIVATE_KEY', workerSeedString)) {
    console.log(`\n# Set Worker secret`)
    console.log(`echo "${workerSeedString}" | npx wrangler secret put WORKER_PRIVATE_KEY`)
  }
  if (!await uploadSecret('AUTHOR_DID', authorSigner.did)) {
    console.log(`\n# Set DIDs (optional, for reference)`)
    console.log(`echo "${authorSigner.did}" | npx wrangler secret put AUTHOR_DID`)
  }
  if (!await uploadSecret('WORKER_DID', workerSigner.did)) {
    console.log(`echo "${workerSigner.did}" | npx wrangler secret put WORKER_DID`)
  }
  if (!await uploadSecret('AUTHOR_WORKER_DELEGATION', delegation.toString())) {
    console.log("\n# Store the worker ChapterReadCap delegation in Cloudflare Secrets:");
    console.log(`   echo "${delegation.toString()}" | npx wrangler secret put AUTHOR_WORKER_DELEGATION`);
  }
  // 6. Enable local secrets read - local only DO NOT CHECK file into Github or similar repo
  // Automatically write local secrets for wrangler dev
  const devVarsContent = `
WORKER_PRIVATE_KEY="${workerSeedString}"
AUTHOR_DID="${authorSigner.did}"
WORKER_DID="${workerSigner.did}"
AUTHOR_WORKER_DELEGATION="${delegation.toString()}"
`.trim()

  fs.writeFileSync('.dev.vars', devVarsContent, 'utf8')
  console.log("Saved local secrets automatically to .dev.vars for wrangler dev!\nDO NOT SAVE THIS FILE IN code Repo - EVER!")
}

generateSeedAndDelegate()
