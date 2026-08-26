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
