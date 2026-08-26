import { Hono } from 'hono'
import { registerChapterRoutes } from './routes/chapters'
import { registerFeedbackRoutes } from './routes/feedback'
import { registerSessionRoutes } from './routes/session'
import { registerWorkspaceRoutes } from './routes/workspace'

export type Bindings = {
  NOVEL_TEXT_KV: KVNamespace,
  READER_SESSION_KV: KVNamespace,
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()
registerChapterRoutes(app)
registerFeedbackRoutes(app)
registerSessionRoutes(app)
registerWorkspaceRoutes(app)

export default app
