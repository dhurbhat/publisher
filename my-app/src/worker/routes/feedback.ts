import { Hono } from 'hono'
import type { Bindings } from '../../index'
import { ChapterReadCap } from '../chapter-cap'
import { requireChapterCap } from '../middleware/require-chapter-cap'

export function registerFeedbackRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.post('/api/feedback', requireChapterCap(ChapterReadCap), async (c) => {
    let token: string
    // OLD CODE Need to remove
    // try {
    //   token = getBearerToken(c.req.header('Authorization'))
    // } catch (error) {
    //   return c.text('Unauthorized', 401)
    // }

    try {
      const delegation = await verifyDelegation(token) // OLD CODE - MUST REPLACE
      const feedback = await c.req.json()
      const { chapterSlug, sentenceId, feedbackText } = feedback

      const query = `
        INSERT INTO feedback (chapter_slug, sentence_id, reader_did, feedback)
        VALUES (?, ?, ?, ?)
      `
      await c.env.DB.prepare(query)
        .bind(chapterSlug, sentenceId, delegation.iss, feedbackText)
        .run()

      return c.json({ message: 'Feedback submitted successfully' })
    } catch (error) {
      console.error('Error storing feedback:', error)
      return c.text('Unauthorized: OR Failed to store feedback', 500)
    }
  })
}