// src/components/layout.tsx  
import { FC } from 'hono/jsx'  
import cssContent from '../styles.txt?raw'  
  
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
    <button id="toggle-toc" class="btn-toc">☰ Chapters</button>  
    <div class="novel-title">First Murder in 200 years</div>  
    <div id="token-status-badge" class="badge-status badge-inactive">No Access Token</div>  
  </header>  
)  
  
export const AuthOverlay: FC = () => (  
  <section id="auth-section" class="auth-overlay hidden">  
    <div class="auth-card">  
      <h1>The Novel Workspace</h1>  
      <p id="auth-status-msg" class="subtitle">Initializing secure browser enclave...</p>  
      <form id="auth-form">  
        <div class="form-group">  
          <label for="email">Reviewer Email</label>  
          <input type="email" id="email" required placeholder="reviewer@example.com" />  
        </div>  
        <div class="form-group">  
          <label for="nonce">6-Digit Nonce</label>  
          <input type="text" id="nonce" required pattern="[0-9]{6}" maxlength={6}  
                 placeholder="123456" autocomplete="one-time-code" />  
        </div>  
        <button type="submit" id="submit-btn">Verify &amp; Grant Capability</button>  
      </form>  
      <div id="status-message" class="status hidden" />  
      <p class="enclave-footer">Minting cryptographic browser enclave...</p>  
    </div>  
  </section>  
)  
  
export const WorkspaceGrid: FC = () => (  
  <div id="workspace-container" class="workspace-container hidden">  
    <aside class="left-sidebar" id="left-sidebar">  
      <h3>Chapters</h3>  
      <ul id="dynamic-chapter-list" class="chapter-list" />  
    </aside>  
    <main id="main-reader" class="main-reader hidden">  
      <article class="manuscript-body" id="text-canvas">  
        <h1 class="canvas-welcome-title">Welcome to The Novel Workspace</h1>  
        <p class="canvas-welcome-text">Please select a chapter to begin viewing model drafts.</p>  
      </article>  
    </main>  
    <aside class="right-sidebar">  
      <div id="subsection-nav-container" class="subsection-container">  
        <h4 class="sidebar-heading">On This Page</h4>  
        <ul id="subsection-links" class="subsection-list" />  
      </div>  
      <h4 class="sidebar-heading">Comments</h4>  
      <div id="comment-stream" class="comment-stream">  
        Click on any line inside the text canvas to view or drop inline notes  
      </div>  
    </aside>  
  </div>  
)  
  
export const ClientEntry: FC = () => (  
  <>  
    <script type="importmap" dangerouslySetInnerHTML={{ __html: JSON.stringify({  
      imports: {  
        "iso-ucan": "https://esm.sh/iso-ucan",  
        "iso-ucan/": "https://esm.sh/iso-ucan/",  
        "iso-kv": "https://esm.sh/iso-kv",  
        "iso-kv/": "https://esm.sh/iso-kv/",  
        "iso-signatures": "https://esm.sh/iso-signatures",  
        "iso-signatures/": "https://esm.sh/iso-signatures/",  
        "iso-did": "https://esm.sh/iso-did",  
        "iso-base": "https://esm.sh/iso-base",  
        "iso-base/": "https://esm.sh/iso-base/",  
        "zod": "https://esm.sh/zod",  
        "zod/": "https://esm.sh/zod/"
      }  
    })}} />  
    <script type="module" src="/app.js" />  
  </>  
)  
  
export const WorkspaceLayout: FC = () => (  
  <>  
    <TopToolbar />  
    <AuthOverlay />  
    <WorkspaceGrid />  
    <ClientEntry />  
  </>  
)