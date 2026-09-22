import { FC } from 'hono/jsx'

import cssContent from '../styles.txt?raw'
import readerContent from '../client/reader.txt?raw'
import authContent from '../client/auth.txt?raw'
import clientEntryContent from '../client/index.txt?raw'

const clientContent = `${readerContent}\n${authContent}\n${clientEntryContent}`

export const HeadStyles: FC = () => (
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>The Novel Workspace</title>
    <style dangerouslySetInnerHTML={{ __html: cssContent }} />
  </head>
)

export const TopToolbar: FC = () => (
  <header class="toolbar">
    <button id="toggle-toc" onclick="toggleSidebar()">☰ Chapters</button>
    <div class="novel-title">The Novel Workspace</div>
    <button id="auth-status" style="border-color: #ef4444; color: #ef4444;">No Access Token</button>
  </header>
)

export const LeftNavigation: FC = () => (
  <aside class="left-sidebar" id="left-sidebar">
    <h3>Chapters</h3>
    <ul id="dynamic-chapter-list" style="list-style: none;">
      <li style="color: #9ca3af; font-size: 0.9rem; padding: 4px 0;">Loading catalog...</li>
    </ul>
  </aside>
)

export const MainReader: FC = () => (
  <main class="main-reader">
    <article class="manuscript-body" id="text-canvas">
      <h1 style="text-align: center; margin-bottom: 24px;">Welcome to The Novel Workspace</h1>
      <p style="color: #6b7280; text-align: center;">Please upload your token or select a chapter to begin viewing model drafts.</p>
    </article>
  </main>
)

export const RightFeedbackPanel: FC = () => (
  <aside class="right-sidebar">
    <div id="subsection-nav-container" style="margin-bottom: 24px; padding-bottom:16px; border-bottom: 1px solid #e5e7eb;display:none;">
      <h4 style="font-size: 1rem; text-transform: uppercase; font-weight: 500; color: #6b7280;letter-spacing: 0.05em;margin-bottom: 0.5rem;">On This Page</h4>
      <ul id="subsection-links" style="list-style: none; display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.9rem;"></ul>
    </div>
    <h4>Comments</h4>
    <div id="comment-stream" style="color: #9ca3af; font-size: 0.9rem;">Click on any line inside the text canvas to view or drop inline notes</div>
  </aside>
)

export const ClientScripts: FC = () => (
  <script dangerouslySetInnerHTML={{ __html: clientContent }} />
)

export const WorkspaceLayout: FC = () => (
  <>
    <TopToolbar />
    <div class="workspace-container">
      <LeftNavigation />
      <MainReader />
      <RightFeedbackPanel />
    </div>
    <ClientScripts />
  </>
)

export interface LoginProps {
  error?: string
}

export const AdminLogin: FC<LoginProps> = ({ error }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Author Control Panel Login</title>
        <style>{`
          body { font-family: system-ui, -apple-system, sans-serif; background: #f9f9fb; color: #1e1e24; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .login-container { background: #ffffff; padding: 2.5rem; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); width: 100%; max-width: 460px; box-sizing: border-box; }
          h1 { font-size: 1.6rem; font-weight: 700; margin: 0 0 0.5rem 0; color: #111115; }
          p { font-size: 0.95rem; color: #62626a; margin: 0 0 1.5rem 0; line-height: 1.4; }
          label { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #4a4a52; display: block; margin-bottom: 0.5rem; }
          textarea { width: 100%; height: 140px; padding: 0.75rem; border: 1px solid #e2e2e8; border-radius: 6px; font-family: monospace; font-size: 0.85rem; resize: none; box-sizing: border-box; margin-bottom: 1.25rem; background: #fafafc; }
          textarea:focus { outline: none; border-color: #2563eb; background: #ffffff; }
          button { width: 100%; padding: 0.85rem; background: #2563eb; color: #ffffff; border: none; border-radius: 6px; font-weight: 600; font-size: 0.95rem; cursor: pointer; transition: background 0.2s ease; }
          button:hover { background: #1d4ed8; }
          .error-banner { background: #fef2f2; border: 1px solid #fee2e2; color: #991b1b; padding: 0.75rem; border-radius: 6px; font-size: 0.9rem; margin-top: 1.25rem; display: flex; align-items: center; gap: 0.5rem; }
        `}</style>
      </head>
      <body>
        <div class="login-container">
          <h1>Admin Authorization</h1>
          <p>Provide your <strong>AUTHOR_ADMIN_WORKER_DELEGATION</strong> UCAN token string to unlock the administrative route dashboards.</p>
          
          <form method="POST" action="/admin">
            <label for="ucan_token">UCAN Token String (JWT)</label>
            <textarea 
              id="ucan_token" 
              name="ucan_token" 
              placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..." 
              required
            ></textarea>
            <button type="submit">Authenticate Session</button>
          </form>

          {error && (
            <div class="error-banner">
              ⚠️ {error}
            </div>
          )}
        </div>
      </body>
    </html>
  )
}