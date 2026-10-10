import { ChapterFeedbackCap, ChapterListCap, ChapterReadCap } from '../shared/chapter-cap.js'
import { ucanStore } from './ucan-browser-store.js'
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
import { CommentRow } from '../worker/routes/chapter.js'

const verifierResolver = new Resolver({ ...EdDSA.verifier })
let selectedSentenceId: number | null = null
let activeChapterSlug: string | null = null
let currComments: CommentRow[] = []

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
    const reviewerDid = signer.did
    const invocation = await ChapterReadCap.invoke({
        iss: signer,
        sub: parse(authorDid).did,
        args: { email, slug, reviewerDid },
        store: ucanStore,
        exp: Math.floor(Date.now() / 1000) + 300,
        verifierResolver,
    })
    const { text, comments } = await postInvocation<{ text: string, comments: CommentRow[] }>(
        `/api/chapters/${slug}`, invocation.bytes
    )
    return { text, comments }
}

document.addEventListener('DOMContentLoaded', async () => {
    // console.log('[app] DOMContentLoaded fired')
    try {
        const signer = await getOrCreateSigner()
        // console.log('[app] signer ready, did =', signer.did)
        const hasDel = await hasDelegation()
        // console.log('[app] hasDelegation =', hasDel)
        if (!hasDel) {
            showAuthView(async (email: string, nonce: string) => {
                // console.log('[app] submitting nonce for', email)
                await verifyNonce(signer.did, email, nonce)
                window.location.reload()
            })
            return
        }

        const authorDid = await getAuthorDid()
        const email = await getReviewerEmail()
        // console.log('[app] authorDid =', authorDid, 'email =', email)

        showWorkspaceView(email, signer.did)
        document.getElementById('text-canvas')!.addEventListener('click', (e) => {
            const span = (e.target as HTMLElement).closest<HTMLElement>('.novel-sentence')
            if (span)
                selectSentence(span, Number(span.dataset.id))
        })
        document.getElementById('toggle-revisions')!.addEventListener('click', (e) => {
            const hiding = document.body.classList.toggle('hide-revisions')
                ; (e.currentTarget as HTMLElement).textContent = hiding ? 'Show changes' : 'Hide changes'
        })

        const chapters = await loadChapters(signer, authorDid, email)
        renderChapterList(chapters, (slug) => {
            loadChapter(signer, authorDid, email, slug)
                .then(({ text, comments }) => renderChapterText(text, comments))
                .catch((err) => showError(err.message))
        })

        if (chapters.length > 0) {
            const canvas = document.getElementById('text-canvas')!
            canvas.innerHTML = '<p style="color: #6b7280; text-align: center;">Securely loading chapter...</p>';
            const { text, comments } = await loadChapter(signer, authorDid, email, chapters[0].name)
            currComments = comments
            // console.log('[app] comments received=', comments)
            renderChapterText(text, comments)
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
    const sorted = [...chapters].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

    ul.innerHTML = ''
    for (const c of sorted) {
        const li = document.createElement('li')
        const a = document.createElement('a')
        a.href = '#'
        a.textContent = c.name.replace('chapter-', '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
        li.dataset.slug = c.name
        a.addEventListener('click', (e) => { e.preventDefault(); onSelect(c.name) })
        li.appendChild(a)
        ul.appendChild(li)
    }
}

function renderChapterText(chapterText: string, comments: CommentRow[]) {
    const canvas = document.getElementById('text-canvas')!
    // console.log(`[app] chapter text: ${chapterText.slice(0, 25)}...`)
    canvas.innerHTML = `<div id="manuscript-viewport" style="line-height: 1.85; font-size: 1.15rem;">${parseSentencesIntoSpans(chapterText)}</div>`;
    buildSubsectionNavigation();
    markCommentedSentences(comments)
    resetFeedbackUI();
    renderComments(comments)
    updateRevisionUI()
}

function renderComments(comments: CommentRow[]) {
    const hasRevisions = !!document.querySelector('.rev-del, .rev-ins')
    const hasComments = comments.length > 0
    const stream = document.getElementById('comment-list')!
    stream.insertAdjacentHTML('beforebegin', hasRevisions && hasComments ? '<div class="comment-caution">⚠ This draft has revisions — some notes may point at shifted lines.</div>' : '')
    if (!comments.length) {
        stream.innerHTML = '<div class="comment-empty">Click on any line…</div>'
        return
    }
    stream.innerHTML = ''
    for (const c of comments) {
        const item = document.createElement('div')
        item.className = 'comment-card'
        item.innerHTML = `<span class="comment-ref">¶ ${c.sentence_id}</span>  
                          <p>${c.feedback}</p>`
        item.addEventListener('click', () => {
            const span = document.querySelector<HTMLElement>(
                `.novel-sentence[data-id="${c.sentence_id}"]`)
            const isOrphan = span === null
            const isDrifted = Boolean(span && c.sentence_text && span.textContent!.trim() !== c.sentence_text)
            item.classList.toggle('comment-stale', isOrphan || isDrifted)

            if (isOrphan || isDrifted) {
                item.innerHTML = `<span class="comment-ref">¶ ${c.sentence_id} · stale</span>  
                      <p>${c.feedback}</p>  
                      ${c.sentence_text ? `<small class="stale-ctx">was: "${esc(c.sentence_text.slice(0, 80))}…"</small>` : ''}`
            }
            span!.scrollIntoView({ behavior: 'smooth', block: 'center' })
            document.querySelectorAll('.novel-sentence')
                .forEach(el => el.classList.remove('active-highlight'))
            span!.classList.add('active-highlight')
            // console.log('[app] span active-highlight added')
            // selectSentence(span, c.sentence_id)   // reuse existing highlight + panel  
        })
        stream.appendChild(item)
    }
}

function showError(msg: string) {
    const statusEl = document.getElementById('status-message')
    if (statusEl) {
        statusEl.classList.remove('hidden')
        statusEl.textContent = msg
    }
}

/* handle CriticMarkdown */
const CRITIC = /\{~~.*?~~\}|\{--.*?--\}|\{\+\+.*?\+\+\}|\{>>.*?<<\}/gs
// italic runs: *text* — must start with non-space, no newlines inside * per markdown…  
// but Scrivener's newline-italic means the CONTENT may contain sentences, not \n  
const MD_EM = /\*\S[^*]*\*/g
const INLINE = new RegExp(`${CRITIC.source}|${MD_EM.source}`, 'gs')

const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const renderCriticMarkup = (s: string) => s
    .replace(/\{~~(.*?)~>(.*?)~~\}/gs, (_, a, b) =>
        `<del class="rev-del">${esc(a)}</del><ins class="rev-ins">${esc(b)}</ins>`)
    .replace(/\{~~(.*?)~~\}/gs, (_, a) => `<del class="rev-del">${esc(a)}</del>`)
    .replace(/\{--(.*?)--\}/gs, (_, a) => `<del class="rev-del">${esc(a)}</del>`)
    .replace(/\{\+\+(.*?)\+\+\}/gs, (_, a) => `<ins class="rev-ins">${esc(a)}</ins>`)
    .replace(/\{>>(.*?)<<\}/gs, (_, a) =>
        `<span class="rev-comment" title="${esc(a)}">※</span>`)

function parseSentencesIntoSpans(text: string) {
    const paragraphs = text.split(/\n+/);
    let globalIndexCounter = 0;
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });

    const emitSpan = (content: string) => {
        if (!content.trim()) return '';
        const id = globalIndexCounter++;
        return `<span class="novel-sentence" data-id="${id}">${content}</span>`;
    };
    const renderInline = (m: string) =>
        m.startsWith('*') ? `<em>${esc(m.slice(1, -1))}</em>` : renderCriticMarkup(m)

    return paragraphs.map(paragraphContent => {
        const trimmed = paragraphContent.trim();
        if (!trimmed) return '';

        if (trimmed.startsWith('# ')) {
            return `<h1 style="margin: 2rem 0 1rem 0; font-size: 1.8rem; font-weight: 700; color: #111827;">${esc(trimmed.substring(2))}</h1>`;
        }
        if (trimmed.startsWith('## ')) {
            return `<h2 class="manuscript-section" style="margin: 1.5rem 0 0.75rem 0; font-size: 1.4rem; font-weight: 600; color: #374151;">${esc(trimmed.substring(3))}</h2>`;
        }
        if (trimmed.startsWith('### ')) {
            return `<h3 class="manuscript-subsection" style="margin: 1.25rem 0 0.5rem 0; font-size: 1.2rem; font-weight: 600; color: #4b5563; font-style: italic;">${esc(trimmed.substring(4))}</h3>`;
        }

        // Split paragraph into alternating [plain, marker, plain, marker, ...]  
        const pieces = trimmed.split(INLINE);          // plain-text gaps  
        const markers = trimmed.match(INLINE) ?? [];   // CriticMarkup blocks in order  

        const wrappedSpans = pieces.map((piece, i) => {
            // 1. segment the plain-text gap into sentences  
            const plainSpans = Array.from(segmenter.segment(piece))
                .filter(seg => seg.segment.trim())
                .map(seg => emitSpan(esc(seg.segment)))
                .join('');
            // 2. emit the marker that follows this gap, as one atomic span  
            const markerSpan = markers[i]
                ? emitSpan(renderInline(markers[i]))
                : '';
            return plainSpans + markerSpan;
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
    const comment = currComments.find(c => c.sentence_id === id)
    // console.log(`[app] selectSentence() comment: ${comment ? comment.feedback : 'null'}`)

    const panel = document.getElementById('comment-composer')!
    panel.innerHTML = `
    <h4 style="margin-bottom: 12px; font-size: 0.95rem; color: #111827;">Leave Note for Sentence #${id}<span><small><a href="#" id="close-composer" style="text-decoration: none">&nbsp;&nbsp;Close</small></span></h4>
    <textarea id="feedback-note" style="width: 100%; height: 120px; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; font-family: inherit; margin-bottom: 12px; resize: none;" placeholder="Type your edits or critiques here...">${comment ? comment.feedback : ''}</textarea>
    <button style="width: 100%; background: #111827; color: white; padding: 10px; border: none; border-radius: 6px; font-weight: 500; cursor: pointer;">Save Review Note</button>
  `;
    panel.querySelector('button:last-of-type')!.addEventListener('click', () => submitLineNote(selectedSentenceId!))
    document.getElementById('close-composer')!.addEventListener('click', (e) => {
        e.preventDefault()
        resetFeedbackUI()
    })
}

function resetFeedbackUI() {
    selectedSentenceId = null;
    document.getElementById('comment-composer')!.innerHTML = ''
    // document.getElementById('comment-stream')!.innerHTML = '<div style="color: #9ca3af; font-size: 0.9rem;">Click on any line inside the text canvas to view or drop inline notes</div>';
};
function markCommentedSentences(comments: CommentRow[]) {
    for (const c of comments) {
        document.querySelector<HTMLElement>(
            `.novel-sentence[data-id="${c.sentence_id}"]`
        )?.classList.add('has-comment')
    }
}

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
        const spanText = document.querySelector<HTMLElement>(
            `.novel-sentence[data-id="${sId}"]`)?.textContent?.trim() ?? ''
        const invocation = await ChapterFeedbackCap.invoke({
            iss: signer,
            sub: parse(authorDid).did,
            args: { email: email, sentenceId: sId, slug: activeChapterSlug!, feedback: commentText, sentenceText: spanText.slice(0, 300) },
            store: ucanStore,
            exp: Math.floor(Date.now() / 1000) + 300,
            verifierResolver,
        })
        const res = await postInvocation<{ message: string }>(`/api/feedback`, invocation.bytes)
        alert(`Note submitted ${res.message}`);
        currComments.push({
            sentence_id: sId,
            feedback: commentText,
            sentence_text: spanText,
            created_at: new Date().toISOString(),
        })
        currComments.sort((a, b) => a.sentence_id - b.sentence_id)  // match server ORDER BY  
        renderComments(currComments)
        markCommentedSentences(currComments)  // if you added badges  
        resetFeedbackUI()
    } catch (error) {
        console.error('[feedback] submit failed:', error)
        alert(`Failed to save feedback: ${error instanceof Error ? error.message : String(error)}`)
    }
}

// Show legend + toggle only when the chapter actually contains revisions  
function updateRevisionUI() {
    const hasRevisions = !!document.querySelector('.rev-del, .rev-ins, .rev-comment')
    document.getElementById('rev-legend')?.classList.toggle('hidden', !hasRevisions)
    document.getElementById('toggle-revisions')?.classList.toggle('hidden', !hasRevisions)
}