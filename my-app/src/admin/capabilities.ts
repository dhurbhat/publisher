import { Capability } from "iso-ucan/capability"
import { z } from "zod"

export const ChapterReadCap = Capability.from({
    schema: z.object({
        email: z.email()
    }),
    cmd: '/chapter/read',
});

export const AdminCap = Capability.from({
    schema: z.object({ action: z.enum(['invite', 'revoke', 'list'])}),
    cmd: '/admin',
})

export const capabilities = [ChapterReadCap, AdminCap] as const