import { EdDSASigner } from 'iso-signatures/signers/eddsa.js'
import { Delegation } from 'iso-ucan/delegation'
import { ucanStore, rawIdb } from './ucan-browser-store.js'
import { AuthorizeRequest, AuthorizeResponseSchema } from '../shared/schemas.js'

const SIGNER_KEY = 'reviewer-signer'
const AUTHOR_DID_KEY = 'author-did'
const WORKER_DID_KEY = 'worker-did'
const EMAIL_KEY = 'reviewer-email'

export async function getOrCreateSigner(): Promise<EdDSASigner> {
  const exported = (await rawIdb.get(SIGNER_KEY)) as string | undefined
  if (exported) return EdDSASigner.import(exported)

  const signer = await EdDSASigner.generate()
  await rawIdb.set(SIGNER_KEY, signer.export())
  return signer
}

export async function getExistingSigner(): Promise<EdDSASigner> {
  return await EdDSASigner.import(await rawIdb.get(SIGNER_KEY) as string)
}

export async function hasDelegation(): Promise<boolean> {
  const authorDid = await rawIdb.get(AUTHOR_DID_KEY)
  return Boolean(authorDid)
}

export async function verifyNonce(
  reviewerDid: string,
  email: string,
  nonce: string
) {
  const payload: AuthorizeRequest = {
    reviewerEmail: email.trim(),
    nonce: nonce.trim(),
    reviewerDid: reviewerDid as `did:${string}:${string}`,
  }
  const res = await fetch('/api/verify-nonce', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  console.log('[session] verify-nonce status =', res.status)
  if (!res.ok) {
    const err = await res.json() as { message: string }
    throw new Error(err.message || 'Verification failed')
  }
  const rawData = await res.json()

  // Validate response payload structure using Zod
  const { delegationToken, authorWorkerDelegation, workerDID, authorDID } = AuthorizeResponseSchema.parse(rawData)

  const wrDelegation = await Delegation.fromString(delegationToken)
  const awDelegation = await Delegation.fromString(authorWorkerDelegation)
  await ucanStore.add([awDelegation, wrDelegation]) // Worker->Reviewer, persisted into IndexedDB
  console.log(`[session] aw: ${awDelegation} wr: ${wrDelegation}`)

  await rawIdb.set('wr-delegation', wrDelegation)
  await rawIdb.set('aw-delegation', awDelegation)

  await rawIdb.set(AUTHOR_DID_KEY, authorDID)
  await rawIdb.set(WORKER_DID_KEY, workerDID)
  await rawIdb.set(EMAIL_KEY, email)
}

export async function getAuthorDid(): Promise<string> {
  const v = await rawIdb.get(AUTHOR_DID_KEY)
  if (!v) throw new Error('Author DID not found — reviewer not onboarded yet')
  return v as string
}

export async function getReviewerEmail(): Promise<string> {
  const v = await rawIdb.get(EMAIL_KEY)
  if (!v) throw new Error('Reviewer email not found')
  return v as string
}