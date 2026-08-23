import * as fs from 'fs'
import { Capability } from 'iso-ucan/capability'
import { Store } from 'iso-ucan/store'                // Added import
import { MemoryDriver } from 'iso-kv/drivers/memory.js'  // Added import
import { EdDSASigner } from 'iso-signatures/signers/eddsa.js'
import { z } from 'zod'

async function mintInviteToken() {
  // 1. Read private seed securely from parent directory
  if (!fs.existsSync('../author_private.seed')) {
    console.error("Error: ../author_private.seed file missing!")
    return
  }
  const secretHex = fs.readFileSync('../author_private.seed', 'utf8').trim()
  // 2. Initialize your local signing authority engine cleanly
  const authorSigner = await EdDSASigner.import(secretHex)
  const authorDid = authorSigner.did
  const delegate = (await EdDSASigner.generate()).did

  // 3. Instantiate a minimal stateless store to satisfy TypeScript constraints
  const store = new Store(new MemoryDriver())

  // 4. Define the exact Capability structure (Using attenuation-only rule)
  const ChapterReadCap = Capability.from({
    schema: z.never(), 
    cmd: '/chapter/read',
  })

  const oneYearInSeconds = 365 * 24 * 60 * 60
  const expirationTimestamp = Math.floor(Date.now() / 1000) + oneYearInSeconds

  // 5. Generate the cryptographic token delegation payload pass
  const delegation = await ChapterReadCap.delegate({
    iss: authorSigner,            
    aud: delegate,               
    sub: authorDid,               
    pol: [],                      
    exp: expirationTimestamp,
    store,                     // Passed the minimal store here
  })

  // 6. Extract the payload string format
  const tokenString = delegation.toString()
  
  console.log("\n=== SUCCESS: YOUR CRYPTOGRAPHIC ACCESS TOKEN ===")
  console.log(tokenString)
  console.log("\n=== TEST YOUR LOCAL SERVER LINK IN TERMINAL ===")
  console.log(`curl -H "Authorization: Bearer ${tokenString}" http://localhost:8787/api/chapter/chapter-1\n`)
}

mintInviteToken()
