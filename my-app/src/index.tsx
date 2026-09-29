import { Hono } from 'hono'
import { registerSessionRoutes } from './worker/routes/verify-nonce.js'
import { registerChapterRoutes } from './worker/routes/chapter.js'
import { serveStatic } from 'hono/serve-static'
export type Bindings = {
  NOVEL_TEXT_KV: KVNamespace,
  READER_SESSION_KV: KVNamespace,
  UCAN_STORE_KV: KVNamespace,
  DB: D1Database,
  ASSETS: Fetcher,

  AUTHOR_DID: string,
  AUTHOR_WORKER_DELEGATION: string, // Chapter Worker delegation from Author
  WORKER_PRIVATE_KEY: string,
  WORKER_DID: string,
}

const app = new Hono<{ Bindings: Bindings }>()
// app.route('/', verifyNonceRoute)  
// app.route('/', chaptersRoute)  

app.get('/', (c) => {  
  // Serve public/index.html explicitly  
  return c.env.ASSETS.fetch(new URL('/index.html', c.req.url))  
}) 
registerChapterRoutes(app)
registerSessionRoutes(app)
export default app