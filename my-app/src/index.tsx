import { Hono } from 'hono'
import { registerSessionRoutes } from './worker/routes/verify-nonce.js'
import { registerChapterRoutes } from './worker/routes/chapter.js'
import { HeadStyles, WorkspaceLayout } from './components/layout.js'
import { registerFeedbackRoutes } from './worker/routes/feedback.js'
import { FC } from 'hono/jsx'

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

// 1. Define the Tab Component using only divs
const Tabs: FC = () => {
  return (
    <div class="tabs-auth" style="font-family: sans-serif; max-width: 600px; margin: 20px auto;">
      <p class="subtitle">
        The manuscript you are about to read is protected by User Controlled Authorization Network <a href="https://ucan.xyz">UCAN</a>.
        <br>&nbsp;</br><quote>"UCAN is a trustless, secure, local-first authorization network that puts users in control of their permissions — no central authority required."</quote>
      </p>
      <p class="subtitle">For this manuscript app, first, a secure enclave is created in your browser and cryptographic keys are generated locally.
        Next, you are asked to exchange a privately shared PIN with a custom authorization to read the manual. The server verifies your PIN and
        authorizes your browser to view the manuscript. Custom authorization is only granted for this browser and stored locally.
      </p>

      {/* Tab Contents wrapper */}
      <div class="tab-contents" style="padding: 20px 0;">
          <p id="auth-status-msg" class="subtitle">
            <b>No authorization was found on this browser</b>
          </p>
          <form id="auth-form">
            <div class="form-group">
              <label for="email">Reviewer Email</label>
              <input type="email" id="email" required placeholder="reviewer@example.com" />
            </div>
            <div class="form-group">
              <label for="nonce">6-Digit PIN</label>
              {/* <input type="text" id="nonce" required pattern="[0-9]{6}" maxlength={6}
                placeholder="123456" autocomplete="one-time-code" /> */}
              <p style="font-size: 0.95rem; color: #6b7280; margin-bottom: 28px; line-height:1.4;">
                To unlock the manuscript for the very first time,
                enter the 6-digit numeric PIN shared with you.
              </p>
              <input type="text" id="nonce" class="pin-digit-box" autocomplete="one-time-code" placeholder="000000" maxlength={6} inputmode="numeric" required pattern="[0-9]{6}"></input>
            </div>
            <button type="submit" id="submit-btn">Get authorization</button>
          </form>
          <div id="status-message" class="status hidden" />
          <div class="auth-divider"></div>

        <div id="device-link-section">
          <p class="subtitle">
            Secure enclave created. No valid authorization was found on this browser or device.
            If you were previously granted access and are switching browsers <strong><span style="color: red">or
              devices</span></strong>, enter this code on your <strong>already-authorized device</strong>:
          </p>
          <div id="device-link-code" class="pin-digit-box">389239</div>
          <p id="device-link-status" class="subtitle">Waiting for approval…</p>
        </div>
      </div>

    </div>
  )
}

// 2. Serve the component in a route
// app.get('/', (c) => {
//   return c.html(
//     <html>
//       <HeadStyles />
//       <body>
//         <Tabs />
//       </body>
//     </html>
//   )
// })

export default app