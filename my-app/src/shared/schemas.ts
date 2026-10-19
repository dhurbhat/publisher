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

/*const CommentsResponseSchema = z.object({  
    slug: z.string(),  
    text: z.string(),  
    comments: z.array(z.object({  
        sentence_id: z.number(),  
        feedback: z.string(),  
        created_at: z.string(),  
    })),  
})*/

export const LinkLookupResponseSchema = z.object({  
  did: z.string().startsWith('did:') as z.ZodType<`did:${string}:${string}`>,  
}) 

export const LinkClaimResponseSchema = z.discriminatedUnion('pending', [  
  z.object({ pending: z.literal(true), token: z.null() }),  
  z.object({  
    pending: z.literal(false),  
    token: z.string(),
    parentToken: z.string(),
    email: z.email(),  
    authorWorkerDelegation: z.string(),  
    authorDID: z.string(),  
    workerDID: z.string(),  
  }),  
])

export type LinkClaimResponse = z.infer<typeof LinkClaimResponseSchema>