import { Hono } from 'hono'
import type { Bindings } from '../../index'
import { ChapterFeedbackCap } from '../../shared/chapter-cap'
import { requireChapterCap } from '../middleware/require-chapter-cap'

export function registerFeedbackRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.post('/api/feedback', requireChapterCap(ChapterFeedbackCap), async (c) => {
    try {
      const { slug, sentenceId, feedback } = c.get('chapterArgs')
      const invocation = c.get('invocation')

      const query = `
        INSERT INTO feedback (chapter_slug, sentence_id, reader_did, feedback)
        VALUES (?, ?, ?, ?)
      `
      await c.env.DB.prepare(query)
        .bind(slug, sentenceId, invocation.payload.iss, feedback)
        .run()

      return c.json({ message: 'Feedback submitted successfully' })
    } catch (error) {
      console.error('Error storing feedback:', error)
      return c.text('Unauthorized: OR Failed to store feedback', 500)
    }
  })
}