import { Capability } from 'iso-ucan/capability'  
import { z } from 'zod/v4'  
  
// Parent capability — the Worker->Reviewer delegation is minted at this cmd,  
// so a single delegation authorizes every narrower /chapter/* command.  
export const ChapterCap = Capability.from({  
  schema: z.object({ email: z.string() }),  
  cmd: '/chapter',  
})  
  
export const ChapterListCap = Capability.from({  
  schema: z.object({ email: z.string() }),  
  cmd: '/chapter/list',  
})  
  
export const ChapterReadCap = Capability.from({  
  schema: z.object({  
    email: z.string(),  
    slug: z.string(),
    reviewerDid: z.string().startsWith('did:')
  }),  
  cmd: '/chapter/read',  
})

export const ChapterFeedbackCap = Capability.from({
    schema: z.object({
        email: z.string(),
        sentenceId: z.number(),
        slug: z.string(),
        feedback: z.string(),
        sentenceText: z.string()
    }),
    cmd: '/chapter/feedback'
})