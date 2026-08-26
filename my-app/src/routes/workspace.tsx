import { Hono } from 'hono'
import type { Bindings } from '../index'
import { HeadStyles, WorkspaceLayout } from '../components/layout'

const EMPTY_MANUSCRIPT = 'empty-manuscript'

async function getInitialChapter(env: Bindings, requestedChapter: string) {
  if (requestedChapter) return requestedChapter

  const chapterKeys = await env.NOVEL_TEXT_KV.list({ prefix: 'chapter-', limit: 100 })
  if (chapterKeys.keys.length === 0) return EMPTY_MANUSCRIPT

  const sortedChapters = chapterKeys.keys.sort((a, b) => a.name.localeCompare(b.name))
  return sortedChapters[0].name
}

export function registerWorkspaceRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.get('/', async (c) => {
    const email = c.req.query('email') || ''
    const targetChapter = await getInitialChapter(c.env, c.req.query('chapter') || '')

    console.log(`Rendering main workspace for email: ${email}, chapter: ${targetChapter}`)
    return c.html(
      <html>
        <HeadStyles />
        <body data-current-chapter={targetChapter} data-user-email={email}>
          <WorkspaceLayout />
        </body>
      </html>
    )
  })
}
