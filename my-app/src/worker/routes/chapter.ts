import { Hono } from 'hono'
import { requireChapterCap } from '../middleware/require-chapter-cap.js'
import { ChapterListCap, ChapterReadCap } from '../../shared/chapter-cap.js'
import { Bindings } from '../../index.js'

export interface CommentRow {
    sentence_id: number,
    feedback: string,
    created_at: string
    sentence_text: string
}

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
            const args = c.get('chapterArgs') as { email: string; slug: string, reviewerDid: string }

            if (args.slug !== slug) {
                return c.json({ error: 'chapter slug mismatch' }, 403)
            }

            const text = await c.env.NOVEL_TEXT_KV.get(slug)
            if (text === null) {
                return c.json({ error: 'chapter not found' }, 404)
            }
            const resultSet = await c.env.DB.prepare(
                `SELECT sentence_id, feedback, created_at FROM feedback WHERE chapter_slug = ? AND reader_did = ? ORDER BY sentence_id`
            ).bind(args.slug, args.reviewerDid).all<CommentRow>()
            console.log(`[chapter] comments: ${resultSet}`)

            return c.json({ slug, text, comments: resultSet.results })
        }
    )
}