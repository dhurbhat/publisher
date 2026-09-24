import { Hono } from 'hono'
import { requireChapterCap } from '../middleware/require-chapter-cap.js'
import { ChapterListCap, ChapterReadCap } from '../chapter-cap.js'
import type { Invocation } from 'iso-ucan/invocation'
// import type { Env } from '../env.js'  
import { Bindings } from '../index.js'

export function registerChapterRoutes(app: Hono<{ Bindings: Bindings }>) {
    app.post(
        '/api/chapters',
        requireChapterCap(ChapterListCap),
        async (c) => {
            const list = await c.env.NOVEL_TEXT_KV.list()
            const chapters = list.keys.map((k) => ({ name: k.name }))
            return c.json({ chapters })
        }
    )

    app.post(
        '/api/chapters/:slug',
        requireChapterCap(ChapterReadCap),
        async (c) => {
            const slug = c.req.param('slug')
            const args = c.get('chapterArgs') as { email: string; slug: string }

            if (args.slug !== slug) {
                return c.json({ error: 'chapter slug mismatch' }, 403)
            }

            const text = await c.env.NOVEL_TEXT_KV.get(slug)
            if (text === null) {
                return c.json({ error: 'chapter not found' }, 404)
            }

            return c.json({ slug, text })
        }
    )
}