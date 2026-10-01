import { Hono } from 'hono'  
import { registerSessionRoutes } from './worker/routes/verify-nonce.js'  
import { registerChapterRoutes } from './worker/routes/chapter.js'  
import { HeadStyles, WorkspaceLayout } from './components/layout.js'  
import { registerFeedbackRoutes } from './worker/routes/feedback.js'
  
export type Bindings = {  
  NOVEL_TEXT_KV: KVNamespace,  
  READER_SESSION_KV: KVNamespace,  
  UCAN_STORE_KV: KVNamespace,  
  DB: D1Database,  
  ASSETS: Fetcher,  
  AUTHOR_DID: string,  
  AUTHOR_WORKER_DELEGATION: string,  
  WORKER_PRIVATE_KEY: string,  
  WORKER_DID: string,  
}  
  
const app = new Hono<{ Bindings: Bindings }>()  
  
app.get('/', (c) => c.html('<!DOCTYPE html>' + 
  <html>  
    <HeadStyles />  
    <body>  
      <WorkspaceLayout />  
    </body>  
  </html>  
))  
  
// Static assets: public/ is served automatically via the ASSETS binding  
// when wrangler has `assets: { directory: "./public" }` configured.  
// Keep /static/* only if your wrangler config doesn't auto-serve public/.  
app.get('/static/*', async (c) => c.env.ASSETS.fetch(c.req.raw))  
  
registerChapterRoutes(app)  
registerSessionRoutes(app)
registerFeedbackRoutes(app)

export default app