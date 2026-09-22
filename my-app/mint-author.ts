import * as fs from 'fs'
import { EdDSASigner } from 'iso-signatures/signers/eddsa.js'

async function generateAndSaveSeed() {
  // 1. Generate a brand new cryptographic keypair
  const authorKey = await EdDSASigner.generate()
  
  // 2. Export the key as a correctly formatted Multikey string
  const authorSeedString = authorKey.export()

  // 3. Write the string directly to the parent directory file
  fs.writeFileSync('../author_private.seed', authorSeedString, 'utf8')

  console.log("=== SUCCESS ===")
  console.log("Saved compatible Multikey seed to ../author_private.seed")
  console.log(`Associated Author DID: ${authorKey.did}`)

  const workerKey = await EdDSASigner.generate()
  const workerSeedString = workerKey.export()
  fs.writeFileSync('../worker_private.seed', workerSeedString, 'utf8')
  console.log("=== SUCCESS ===")
  console.log("Saved compatible Multikey seed to ../worker_private.seed")
  console.log(`Associated Worker DID: ${workerKey.did}`)

  const adminWorkerKey = await EdDSASigner.generate()
  const adminWorkerSeedString = adminWorkerKey.export()
  fs.writeFileSync('../admin_worker_private.seed', adminWorkerSeedString, 'utf8')
  console.log("=== SUCCESS ===")
  console.log("Saved compatible Multikey seed to ../admin_worker_private.seed")
  console.log(`Associated Worker DID: ${adminWorkerKey.did}`)

    console.log("\n=== DEPLOY TO CLOUDFLARE ===")
  console.log(`# Set Author secret`)
  console.log(`echo "${authorSeedString}" | npx wrangler secret put AUTHOR_PRIVATE_KEY`)
  console.log(`\n# Set Worker secret`)
  console.log(`echo "${workerSeedString}" | npx wrangler secret put CHAPTER_WORKER_PRIVATE_KEY`)
  console.log(`\n# Set ADMIN Worker secret`)
  console.log(`echo "${adminWorkerSeedString}" | npx wrangler secret put ADMIN_WORKER_PRIVATE_KEY`)
  console.log(`\n# Set DIDs (optional, for reference)`)
  console.log(`echo "${authorKey.did}" | npx wrangler secret put AUTHOR_DID`)
  console.log(`echo "${workerKey.did}" | npx wrangler secret put CHAPTER_WORKER_DID`)
  console.log(`echo "${adminWorkerKey.did} | npx wrangler secret put ADMIN_WORKER_DID`)
}

generateAndSaveSeed()
