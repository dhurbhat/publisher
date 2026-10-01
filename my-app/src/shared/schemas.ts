import { z } from 'zod'

export const AuthorizeResponseSchema = z.object({
  delegationToken: z.string(),
  authorWorkerDelegation: z.string(),
  // Force Zod to validate the prefix and cast the resulting type safely
  workerDID: z.string().startsWith('did:') as z.ZodType<`did:${string}:${string}`>,
  authorDID: z.string().startsWith('did:') as z.ZodType<`did:${string}:${string}`>
})
// Define the API Request schema
export const AuthorizeRequestSchema = z.object({
  reviewerEmail: z.email(),
  nonce: z.string().length(6),
  reviewerDid: z.string().startsWith('did:') as z.ZodType<`did:${string}:${string}`>
})

export type AuthorizeRequest = z.infer<typeof AuthorizeRequestSchema>
export type AuthorizeResponse = z.infer<typeof AuthorizeResponseSchema>