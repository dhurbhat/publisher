import { Hono } from 'hono'
import { registerChapterRoutes } from './routes/chapters'
import { registerFeedbackRoutes } from './routes/feedback'
import { registerSessionRoutes } from './routes/session'
import { registerWorkspaceRoutes } from './routes/workspace'
import { Store } from 'iso-ucan/store'
import { CloudflareUcanStore } from './auth/iso-ucan-store'

export type Bindings = {
  NOVEL_TEXT_KV: KVNamespace,
  READER_SESSION_KV: KVNamespace,
  UCAN_STORE_KV: KVNamespace,
  DB: D1Database,

  AUTHOR_DID: string,
  AUTHOR_WORKER_DELEGATION: string, // Chapter Worker delegation from Author
  AUTHOR_ADMIN_WORKER_DELEGATION: string,  // Admin Worker delegation from Author
  // ADMIN_WORKER_PRIVATE_KEY: string,
  ADMIN_WORKER_DID: string,
  CHAPTER_WORKER_DID: string,
  // CHAPTER_WORKER_PRIVATE_KEY: string,
}

export type Variables = {
  ucanStore: Store
  chapterDelegation: string
  adminDelegation: string
}

// --- Initialize ONCE outside the handler ---
// This runs when the Worker starts up or when the isolate is first used.
let store: Store | null = null;
let chapterDelegation: string | null = null;
let adminDelegation: string | null = null;

function initializeUCAN(env: Bindings) {
  if (!store || !chapterDelegation || !adminDelegation) {
    store = new Store(new CloudflareUcanStore(env.UCAN_STORE_KV))
    chapterDelegation = env.AUTHOR_WORKER_DELEGATION
    adminDelegation = env.AUTHOR_ADMIN_WORKER_DELEGATION
  }
  return { store, chapterDelegation, adminDelegation}
}
// --- End Initialization ---

const app = new Hono<{ Bindings: Bindings; Variables: Variables}>()

app.use('*', async(c, next) => {
  const {store, chapterDelegation, adminDelegation } = initializeUCAN(c.env)
  c.set('ucanStore', store)
  c.set('chapterDelegation', chapterDelegation)
  c.set('adminDelegation', adminDelegation)
  await next();
})

registerChapterRoutes(app)
registerFeedbackRoutes(app)
registerSessionRoutes(app)
registerWorkspaceRoutes(app)

export default app
