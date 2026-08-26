import { Hono } from 'hono'
import { getBearerToken, verifyDelegation } from '../auth/ucan'
import type { Bindings } from '../index'

export function registerChapterRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.get('/api/chapters', async (c) => {
    let token: string
    try {
      token = getBearerToken(c.req.header('Authorization'))
    } catch (error) {
      return c.text('Unauthorized', 401)
    }

    try {
      await verifyDelegation(token)
    } catch (error) {
      console.error('Error verifying token:', error)
      return c.text('Unauthorized: Invalid or expired token', 401)
    }

    // Fetch all keys from the KV namespace
    const listResponse = await c.env.NOVEL_TEXT_KV.list({ prefix: 'chapter-' })
    const chapterKeys = listResponse.keys.map(key => key.name)
    return c.json({ chapters: chapterKeys })
  })

  app.get('/api/chapter/:slug', async (c) => {
    const slug = c.req.param('slug')
    let token: string
    try {
      token = getBearerToken(c.req.header('Authorization'))
    } catch (error) {
      return c.text('Unauthorized', 401)
    }

    try {
      await verifyDelegation(token)
    } catch (error) {
      console.error('Error verifying token:', error)
      return c.text('Unauthorized: Invalid or expired token', 401)
    }

    const chapterText = await c.env.NOVEL_TEXT_KV.get(slug)
    if (!chapterText) {
      return c.text('Chapter not found', 404)
    }
    return c.text(chapterText)
  })
}
