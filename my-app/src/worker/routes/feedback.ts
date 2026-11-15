import { Context, Hono } from 'hono'
import type { Bindings } from '../../index'
import { ChapterFeedbackCap, ChapterFeedbackListCap, ChapterFeedbackResolveCap } from '../../shared/chapter-cap'
import { ChapterVars, requireChapterCap } from '../middleware/require-chapter-cap'
import { parse } from 'iso-did'

export interface FeedbackRow {
  id: number
  chapter_slug: string
  sentence_id: number
  reader_did: string
  feedback: string
  sentence_text: string
  reviewed: number
  created_at: string
}

export function registerFeedbackRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.post('/api/feedback', requireChapterCap(ChapterFeedbackCap), async (c) => {
    try {
      const { slug, sentenceId, feedback, sentenceText } = c.get('chapterArgs')
      const invocation = c.get('invocation')

      const query = `
        INSERT INTO feedback (chapter_slug, sentence_id, reader_did, feedback, sentence_text)
        VALUES (?, ?, ?, ?, ?)
      `
      await c.env.DB.prepare(query)
        .bind(slug, sentenceId, invocation.payload.iss, feedback, sentenceText)
        .run()

      return c.json({ message: 'Feedback submitted successfully' })
    } catch (error) {
      console.error('Error storing feedback:', error)
      return c.text('Unauthorized: OR Failed to store feedback', 500)
    }
  })

  const requireAuthor = async (c: Context) => {
    const invocation = c.get('invocation')
    const issDid = parse(invocation.payload.iss).did
    const raw = await c.env.READER_SESSION_KV.get('author:dids')
    const dids: string[] = raw ? JSON.parse(raw) : []
    if (!dids.includes(issDid)) return c.json({ error: 'for author only' }, 403)
    return null
  }
  app.post('/api/feedback/list', requireChapterCap(ChapterFeedbackListCap), async (c) => {
    const denied = await requireAuthor(c)
    if (denied) return denied
    const { results } = await c.env.DB.prepare(
      `SELECT id, chapter_slug, sentence_id, reader_did, feedback, sentence_text, reviewed, created_at  
         FROM feedback ORDER BY reviewed, chapter_slug, sentence_id`
    ).all<FeedbackRow>()
    return c.json({ feedback: results })
  })

  app.post('/api/feedback/resolve', requireChapterCap(ChapterFeedbackResolveCap), async (c) => {
    const denied = await requireAuthor(c)
    if (denied) return denied
    const { feedbackId } = c.get('chapterArgs')
    await c.env.DB.prepare(
      `UPDATE feedback SET reviewed = 1 - reviewed,  
            reviewed_at = CASE WHEN reviewed = 0 THEN CURRENT_TIMESTAMP ELSE NULL END  
         WHERE id = ?`
    ).bind(feedbackId).run()
    return c.json({ ok: true })
  })
}