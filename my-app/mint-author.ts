import * as fs from 'fs'
import { EdDSASigner } from 'iso-signatures/signers/eddsa.js'

async function generateAndSaveSeed() {
  // 1. Generate a brand new cryptographic keypair
  const key = await EdDSASigner.generate()
  
  // 2. Export the key as a correctly formatted Multikey string
  const seedString = key.export()

  // 3. Write the string directly to the parent directory file
  fs.writeFileSync('../author_private.seed', seedString, 'utf8')

  console.log("=== SUCCESS ===")
  console.log("Saved compatible Multikey seed to ../author_private.seed")
  console.log(`Associated Author DID: ${key.did}`)
}

generateAndSaveSeed()
