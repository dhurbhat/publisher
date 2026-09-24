import { Hono } from 'hono'  
// import type { Env } from './env.js'  
import { registerSessionRoutes } from './routes/verify-nonce.js'  
import { registerChapterRoutes } from './routes/chapter.js'

export type Bindings = {
  NOVEL_TEXT_KV: KVNamespace,
  READER_SESSION_KV: KVNamespace,
  DB: D1Database

  AUTHOR_DID: string,
  AUTHOR_WORKER_DELEGATION: string, // Chapter Worker delegation from Author
  WORKER_PRIVATE_KEY: string,
  WORKER_DID: string,
}

const app = new Hono<{ Bindings: Bindings }>()  
// app.route('/', verifyNonceRoute)  
// app.route('/', chaptersRoute)  
  
registerChapterRoutes(app)
registerSessionRoutes(app)
export default app