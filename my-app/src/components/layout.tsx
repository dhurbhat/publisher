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
    <div class="novel-title">First Murder in 200 Years</div>
    <button id="toggle-revisions" class="btn-toc hidden">Hide changes</button>
    <button id="compare-versions" class="btn-toc hidden">Compare Versions</button>
    <div id="token-status-badge" class="badge-status badge-inactive">No Access Token</div> | 
    <div id="device-link" class="btn-toc hidden">🔗 Link</div> |
    <div id="toggle-comments" class="btn-toc">💬 Comments</div>
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
          {/* <input type="text" id="nonce" required pattern="[0-9]{6}" maxlength={6}  
                 placeholder="123456" autocomplete="one-time-code" />   */}
          <input type="text" id="nonce" class="pin-digit-box" autocomplete="one-time-code" placeholder="000000" maxlength={6} inputmode="numeric" required pattern="[0-9]{6}"></input>

        </div>
        <button type="submit" id="submit-btn">Verify &amp; Grant Capability</button>
      </form>
      <div id="status-message" class="status hidden" />
      <p class="link-device-toggle">
        <a href="#" id="show-device-link">Already authorized on another device?</a>
      </p>

      <div id="device-link-section" class="subtitle hidden">
        <hr class="auth-divider"></hr>
        <p class="subtitle">
          Secure enclave created. No valid authorization was found on this browser or device.
          If you were previously granted access and are switching browsers <strong><span style="color: red">or
            devices</span></strong>, enter this code on your <strong>already-authorized device</strong>:
        </p>
        <div id="device-link-code" class="pin-digit-box">......</div>
        <p id="device-link-status" class="subtitle">Waiting for approval…</p>
        <p class="subtitle" style="font-size:0.9rem; word-break:break-all;">
          This device: <code id="device-did"></code>
        </p>
      </div>
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
    <aside class="right-sidebar" id="right-sidebar">
      <div id="rev-legend" class="rev-legend hidden">
        <strong>Revisions</strong>
        <span class="swatch-del">deleted</span>
        <span class="swatch-ins">inserted</span>
        <span class="swatch-sub"><del>old</del><ins>new</ins></span>
      </div>
      <div id="subsection-nav-container" class="subsection-container">
        <h4 class="sidebar-heading">On This Page</h4>
        <ul id="subsection-links" class="subsection-list" />
      </div>
      <h4 id="sidebar-heading" class="sidebar-heading">💬 Comments</h4>
      <div id="comment-stream" class="comment-stream">
        <div id="comment-list"></div>
        <div id="comment-composer"></div>
        Click on any line inside the text canvas to view or drop inline notes
      </div>
    </aside>
  </div>
)

export const ClientEntry: FC = () => (
  <>
    <script type="importmap" dangerouslySetInnerHTML={{
      __html: JSON.stringify({
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
      })
    }} />
    <script type="module" src="/app.js" />
  </>
)

export const DeviceApproveModal: FC = () => (  
  <div id="device-approve-modal" class="modal-overlay hidden">  
    <div class="modal-card">  
      {/* step: enter code */}  
      <div id="approve-step-code">  
        <h2>Link another device</h2>  
        <p class="subtitle">Enter the 6-digit code shown on the device requesting access.</p> 
        <input id="approve-code-input" type="text" class="pin-digit-box" autocomplete="one-time-code" placeholder="000000" maxlength={6} inputmode="numeric" required pattern="[0-9]{6}"></input> 
        {/* <input id="approve-code-input" class="pin-digit-box" maxlength={6} inputmode="numeric" placeholder="000000" autocomplete="off" />   */}
        <div class="modal-actions">  
          <button id="approve-cancel-btn">Cancel</button>  
          <button id="approve-lookup-btn" class="approve-btn">Look up</button>  
        </div>  
      </div>  
      {/* step: confirm the DID */}  
      <div id="approve-step-confirm" class="hidden">  
        <h2>Approve this device?</h2>  
        <p class="subtitle">Confirm the DID matches what the other device shows:</p>  
        <p id="approve-new-did" class="modal-did"></p>  
        <div class="modal-actions">  
          <button id="approve-back-btn">Back</button>  
          <button id="approve-confirm-btn" class="approve-btn">Approve</button>  
        </div>  
      </div>  
      {/* step: result */}  
      <div id="approve-step-done" class="hidden">  
        <h2>Done</h2>  
        <p id="approve-result" class="subtitle"></p>  
        <div class="modal-actions">  
          <button id="approve-close-btn" class="approve-btn">Close</button>  
        </div>  
      </div>  
    </div>  
  </div>  
)

export const WorkspaceLayout: FC = () => (
  <>
    <TopToolbar />
    <AuthOverlay />
    <DeviceApproveModal />
    <WorkspaceGrid />
    <ClientEntry />
  </>
)