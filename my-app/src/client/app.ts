import { ChapterFeedbackCap, ChapterListCap, ChapterReadCap } from '../shared/chapter-cap.js'
import { rawIdb, ucanStore } from './ucan-browser-store.js'
import {
    getOrCreateSigner,
    hasDelegation,
    verifyNonce,
    getAuthorDid,
    getReviewerEmail,
    getExistingSigner,
} from './reviewer-session.js'
import { base64 } from 'iso-base/rfc4648'
import { parse } from 'iso-did'
import { Resolver } from 'iso-signatures/verifiers/resolver.js'
import * as EdDSA from 'iso-signatures/verifiers/eddsa.js'
import type { EdDSASigner } from 'iso-signatures/signers/eddsa.js'
import { Delegation } from 'iso-ucan/delegation'

const verifierResolver = new Resolver({ ...EdDSA.verifier })
let selectedSentenceId: number | null = null;
let activeChapterSlug: string | null = null;

async function postInvocation<T = unknown>(url: string, invocationBytes: Uint8Array): Promise<T> {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invocation: base64.encode(invocationBytes) }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(err.message || `Request failed: ${res.status}`)
    }
    return res.json()
}

async function loadChapters(signer: EdDSASigner, authorDid: string, email: string) {
    // const [leaf, root] = await Promise.all([
    //     Delegation.fromString(await rawIdb.get('wr-delegation') as string),
    //     Delegation.fromString(await rawIdb.get('aw-delegation') as string),
    // ])
    const invocation = await ChapterListCap.invoke({
        iss: signer,
        sub: parse(authorDid).did,
        args: { email },
        store: ucanStore,
        exp: Math.floor(Date.now() / 1000) + 300,
        verifierResolver,
    })
    const { chapters } = await postInvocation<{ chapters: { name: string }[] }>(
        '/api/chapters', invocation.bytes
    )
    return chapters
}

async function loadChapter(signer: EdDSASigner, authorDid: string, email: string, slug: string) {
    activeChapterSlug = slug
    const invocation = await ChapterReadCap.invoke({
        iss: signer,
        sub: parse(authorDid).did,
        args: { email, slug },
        store: ucanStore,
        exp: Math.floor(Date.now() / 1000) + 300,
        verifierResolver,
    })
    const { text } = await postInvocation<{ text: string }>(
        `/api/chapters/${slug}`, invocation.bytes
    )
    return text
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[app] DOMContentLoaded fired')
    try {
        const signer = await getOrCreateSigner()
        console.log('[app] signer ready, did =', signer.did)
        const hasDel = await hasDelegation()
        console.log('[app] hasDelegation =', hasDel)
        if (!hasDel) {
            showAuthView(async (email: string, nonce: string) => {
                console.log('[app] submitting nonce for', email)
                await verifyNonce(signer.did, email, nonce)
                window.location.reload()
            })
            return
        }

        const authorDid = await getAuthorDid()
        const email = await getReviewerEmail()
        console.log('[app] authorDid =', authorDid, 'email =', email)

        showWorkspaceView(email, signer.did)
        document.getElementById('text-canvas')!.addEventListener('click', (e) => {
            const span = (e.target as HTMLElement).closest<HTMLElement>('.novel-sentence')
            if (span)
                selectSentence(span, Number(span.dataset.id))
        })

        const chapters = await loadChapters(signer, authorDid, email)
        renderChapterList(chapters, (slug) => {
            loadChapter(signer, authorDid, email, slug)
                .then(renderChapterText)
                .catch((err) => showError(err.message))
        })

        if (chapters.length > 0) {
            const canvas = document.getElementById('text-canvas')!
            canvas.innerHTML = '<p style="color: #6b7280; text-align: center;">Securely loading chapter...</p>';
            const content = await loadChapter(signer, authorDid, email, chapters[0].name)
            renderChapterText(content)
        }
    } catch (err) {
        console.error('Hydration error:', err)
        showError(err instanceof Error ? err.message : String(err))
    }
})

// --- UI plumbing ---  
function showAuthView(onSubmit: (email: string, nonce: string) => Promise<void>) {
    document.getElementById('main-reader')?.classList.add('hidden')
    document.getElementById('workspace-container')?.classList.add('hidden')
    document.getElementById('auth-section')!.classList.remove('hidden')
    document.getElementById('auth-status-msg')!.textContent =
        'Enter your reviewer email and 6-digit invite code.'

    document.getElementById('auth-form')!.addEventListener('submit', async (e) => {
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

function showWorkspaceView(email: string, did: string) {
    document.getElementById('auth-section')?.classList.add('hidden')
    document.getElementById('workspace-container')?.classList.remove('hidden')
    document.getElementById('main-reader')?.classList.remove('hidden')
    document.getElementById('subsection-container')?.classList.remove('hidden')
    const badge = document.getElementById('token-status-badge')
    if (badge) {
        badge.textContent = `✓ ${email} · ${did.slice(0, 12)}…${did.slice(-6)}`
        badge.title = did   // full DID on hover  
        badge.classList.replace('badge-inactive', 'badge-active')
    }
}

function renderChapterList(chapters: { name: string }[], onSelect: (slug: string) => void) {
    const ul = document.getElementById('dynamic-chapter-list')!
    ul.innerHTML = ''
    for (const c of chapters) {
        const li = document.createElement('li')
        li.textContent = c.name
        li.dataset.slug = c.name
        li.addEventListener('click', () => onSelect(c.name))
        ul.appendChild(li)
    }
}

function renderChapterText(chapterText: string) {
    const canvas = document.getElementById('text-canvas')!
    console.log(`[app] chapter text: ${chapterText.slice(0, 25)}...`)
    canvas.innerHTML = `<div id="manuscript-viewport" style="line-height: 1.85; font-size: 1.15rem;">${parseSentencesIntoSpans(chapterText)}</div>`;
    buildSubsectionNavigation();
    resetFeedbackUI();
    // document.getElementById('text-canvas')!.innerHTML = chapterText
}

function showError(msg: string) {
    const statusEl = document.getElementById('status-message')
    if (statusEl) {
        statusEl.classList.remove('hidden')
        statusEl.textContent = msg
    }
}

function parseSentencesIntoSpans(text: string) {
    const paragraphs = text.split(/\n+/);
    let globalIndexCounter = 0;
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });

    return paragraphs.map(paragraphContent => {
        const trimmed = paragraphContent.trim();
        if (!trimmed) return '';

        if (trimmed.startsWith('# ')) {
            return `<h1 style="margin: 2rem 0 1rem 0; font-size: 1.8rem; font-weight: 700; color: #111827;">${trimmed.substring(2)}</h1>`;
        }
        if (trimmed.startsWith('## ')) {
            return `<h2 class="manuscript-section" style="margin: 1.5rem 0 0.75rem 0; font-size: 1.4rem; font-weight: 600; color: #374151;">${trimmed.substring(3)}</h2>`;
        }
        if (trimmed.startsWith('### ')) {
            return `<h3 class="manuscript-subsection" style="margin: 1.25rem 0 0.5rem 0; font-size: 1.2rem; font-weight: 600; color: #4b5563; font-style: italic;">${trimmed.substring(4)}</h3>`;
        }

        const segments = segmenter.segment(trimmed);
        const wrappedSpans = Array.from(segments).map(segmentObj => {
            const sentenceText = segmentObj.segment;
            if (!sentenceText.trim()) return '';

            const currentId = globalIndexCounter++;
            return `<span class="novel-sentence" data-id="${currentId}">${sentenceText}</span>`;
        }).join('');

        return `<p style="margin-bottom: 1.5rem; text-indent: 1.5rem; text-align: justify; font-size: 1.15rem; line-height: 1.8;">${wrappedSpans}</p>`;
    }).join('');
}

function buildSubsectionNavigation() {
    const sections = document.querySelectorAll<HTMLElement>('.manuscript-section')!
    const navContainer = document.getElementById('subsection-nav-container')!
    const linksList = document.getElementById('subsection-links')!
    linksList.innerHTML = '';

    if (sections.length === 0) {
        navContainer.style.display = 'none';
        return;
    }

    sections.forEach((section, index) => {
        const sectionId = `section-anchor-${index}`;
        section.id = sectionId;
        const li = document.createElement('li');
        li.innerHTML = `<a href="#${sectionId}" onclick="event.preventDefault(); document.getElementById('${sectionId}').scrollIntoView({ behavior: 'smooth' });" style="text-decoration: none; color: #4b5563; transition: color 0.15s;" onmouseover="this.style.color='#111827'" onmouseout="this.style.color='#4b5563'">${section.innerText}</a>`;
        linksList.appendChild(li);
    });
    navContainer.style.display = 'block';
}

function selectSentence(element: HTMLElement, id: number) {
    document.querySelectorAll('.novel-sentence').forEach(el => el.classList.remove('active-highlight'));
    element.classList.add('active-highlight');
    selectedSentenceId = id;

    const panel = document.getElementById('comment-stream')!
    panel.innerHTML = `
    <h4 style="margin-bottom: 12px; font-size: 0.95rem; color: #111827;">Leave Note for Sentence #${id}</h4>
    <textarea id="feedback-note" style="width: 100%; height: 120px; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-family: inherit; margin-bottom: 12px; resize: none;" placeholder="Type your edits or critiques here..."></textarea>
    <button style="width: 100%; background: #111827; color: white; padding: 10px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">Save Review Note</button>
  `;
    panel.querySelector('button')!.addEventListener('click', () => submitLineNote(selectedSentenceId!))
}

function resetFeedbackUI() {
    selectedSentenceId = null;
    document.getElementById('comment-stream')!.innerHTML = '<div style="color: #9ca3af; font-size: 0.9rem;">Click on any line inside the text canvas to view or drop inline notes</div>';
};

async function submitLineNote(sId: number) {
    const commentText = (document.getElementById('feedback-note')! as HTMLTextAreaElement).value

    if (!commentText.trim()) {
        alert('Please type a feedback comment before saving.');
        return;
    }
    try {
        const signer = await getExistingSigner()
        const authorDid = await getAuthorDid()
        const email = await getReviewerEmail()
        const invocation = await ChapterFeedbackCap.invoke({
            iss: signer,
            sub: parse(authorDid).did,
            args: { email: email, sentenceId: sId, slug: activeChapterSlug!, feedback: commentText },
            store: ucanStore,
            exp: Math.floor(Date.now() / 1000) + 300,
            verifierResolver,
        })
        const res = await postInvocation<{ message: string }>(`/api/feedback`, invocation.bytes)
        alert(`Note submitted ${res.message}`);
        resetFeedbackUI();
    } catch (error) {
        console.error('[feedback] submit failed:', error)
        alert(`Failed to save feedback: ${error instanceof Error ? error.message : String(error)}`)
    }
}