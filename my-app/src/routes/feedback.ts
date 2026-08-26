import { Hono } from 'hono'
import { getBearerToken, verifyDelegation } from '../auth/ucan'
import type { Bindings } from '../index'

export function registerFeedbackRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.post('/api/feedback', async (c) => {
    let token: string
    try {
      token = getBearerToken(c.req.header('Authorization'))
    } catch (error) {
      return c.text('Unauthorized', 401)
    }

    try {
      const delegation = await verifyDelegation(token)
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