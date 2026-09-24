import { ChapterListCap, ChapterReadCap } from '../worker/chapter-cap.js'  
import { ucanStore } from './ucan-browser-store.js'  
import {  
  getOrCreateSigner,  
  hasDelegation,  
  verifyNonce,  
  getAuthorDid,  
  getReviewerEmail,  
} from './reviewer-session.js'  
import { base64 } from 'iso-base/rfc4648'  
  
async function postInvocation(url: string, invocationBytes: Uint8Array) {  
  const res = await fetch(url, {  
    method: 'POST',  
    headers: { 'Content-Type': 'application/json' },  
    body: JSON.stringify({ invocation: base64.encode(invocationBytes) }),  
  })  
  if (!res.ok) {  
    const err = await res.json().catch(() => ({}))  
    throw new Error(err.error || `Request failed: ${res.status}`)  
  }  
  return res.json()  
}  
  
async function loadChapters(signer: any, authorDid: string, email: string) {  
  const invocation = await ChapterListCap.invoke({  
    iss: signer,  
    sub: authorDid,  
    args: { email },  
    store: ucanStore,  
    exp: Math.floor(Date.now() / 1000) + 300,  
  })  
  const { chapters } = await postInvocation('/api/chapters', invocation.bytes)  
  return chapters as { name: string }[]  
}  
  
async function loadChapter(  
  signer: any,  
  authorDid: string,  
  email: string,  
  slug: string  
) {  
  const invocation = await ChapterReadCap.invoke({  
    iss: signer,  
    sub: authorDid,  
    args: { email, slug },  
    store: ucanStore,  
    exp: Math.floor(Date.now() / 1000) + 300,  
  })  
  const { text } = await postInvocation(`/api/chapters/${slug}`, invocation.bytes)  
  return text as string  
}  
  
document.addEventListener('DOMContentLoaded', async () => {  
  try {  
    // 4a) mint or restore Reviewer keypair (IndexedDB-backed)  
    const signer = await getOrCreateSigner()  
    const reviewerDid = signer.did  
  
    // 4b) do we already hold a Worker->Reviewer delegation?  
    if (!(await hasDelegation())) {  
      showAuthView(reviewerDid, async (emailInput: string, nonceInput: string) => {  
        // 4c) verify nonce + email, store delegation, author/worker DIDs  
        await verifyNonce(reviewerDid, emailInput, nonceInput)  
        window.location.reload()  
      })  
      return  
    }  
  
    // 6) we have everything: build first invocation and render workspace  
    const authorDid = await getAuthorDid()  
    const email = await getReviewerEmail()  
  
    showWorkspaceView()  
  
    const chapters = await loadChapters(signer, authorDid, email)  
    renderChapterList(chapters)  
  
    if (chapters.length > 0) {  
      const firstSlug = chapters[0].name  
      const text = await loadChapter(signer, authorDid, email, firstSlug)  
      renderChapterText(text)  
    }  
  } catch (err) {  
    console.error('Hydration error:', err)  
    // fall back to auth view / show error banner  
  }  
})  
  
// --- UI plumbing (unchanged from your existing HTML/CSS structure) ---  
function showAuthView(  
  reviewerDid: string,  
  onSubmit: (email: string, nonce: string) => Promise<void>  
) {  
  document.getElementById('workspace-container')?.classList.add('hidden')  
  const authSection = document.getElementById('auth-section')!  
  authSection.classList.remove('hidden')  
  
  const form = document.getElementById('auth-form') as HTMLFormElement  
  form.addEventListener('submit', async (e) => {  
    e.preventDefault()  
    const email = (document.getElementById('email') as HTMLInputElement).value  
    const nonce = (document.getElementById('nonce') as HTMLInputElement).value  
    const statusEl = document.getElementById('status-message')!  
    statusEl.classList.remove('hidden')  
    statusEl.textContent = 'Verifying…'  
    try {  
      await onSubmit(email, nonce)  
    } catch (err: any) {  
      statusEl.textContent = err.message  
    }  
  })  
}  
  
function showWorkspaceView() {  
  document.getElementById('auth-section')?.classList.add('hidden')  
  document.getElementById('workspace-container')?.classList.remove('hidden')  
}  
  
function renderChapterList(chapters: { name: string }[]) {  
  const ul = document.getElementById('dynamic-chapter-list')!  
  ul.innerHTML = chapters  
    .map((c) => `<li data-slug="${c.name}">${c.name}</li>`)  
    .join('')  
}  
  
function renderChapterText(text: string) {  
  const canvas = document.getElementById('text-canvas')!  
  canvas.innerHTML = text  
}