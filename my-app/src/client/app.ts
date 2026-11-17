// app.ts — part 1: state, api, rendering  
import { ChapterCap, ChapterFeedbackCap, ChapterListCap, ChapterReadCap } from '../shared/chapter-cap.js'
import { rawIdb, ucanStore } from './ucan-browser-store.js'
import {
    getOrCreateSigner, hasDelegation, verifyNonce, getAuthorDid,
    getReviewerEmail, getExistingSigner, acceptDeviceDelegation,
} from './reviewer-session.js'
import { base64 } from 'iso-base/rfc4648'
import { parse } from 'iso-did'
import { Resolver } from 'iso-signatures/verifiers/resolver.js'
import * as EdDSA from 'iso-signatures/verifiers/eddsa.js'
import type { EdDSASigner } from 'iso-signatures/signers/eddsa.js'
import type { CommentRow } from '../worker/routes/chapter.js'
import { LinkClaimResponseSchema, LinkLookupResponseSchema } from '../shared/schemas.js'
import { diffWordsWithSpace } from 'diff'
import { Capability } from 'iso-ucan/capability'
import { z } from 'zod'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const verifierResolver = new Resolver({ ...EdDSA.verifier })
const expIn = (s: number) => Math.floor(Date.now() / 1000) + s

let selectedSentenceId: number | null = null
let activeChapterSlug: string | null = null
let currComments: CommentRow[] = []

// ---------- API ----------  
async function postInvocation<T = unknown>(url: string, bytes: Uint8Array): Promise<T> {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invocation: base64.encode(bytes) }),
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string }
        throw new Error(err.message || `Request failed: ${res.status}`)
    }
    return res.json()
}

// one invocation helper — removes the 4x duplicated invoke boilerplate  
// generic over the cap's schema — args is inferred, not Record<string, unknown>  
const invoke = <S extends z.ZodType, Cmd extends string>(
    cap: Capability<S, Cmd>,
    signer: EdDSASigner,
    authorDid: string,
    args: z.infer<S>,
) =>
    cap.invoke({
        iss: signer,
        sub: parse(authorDid).did,
        args,                          // now type-checked per capability  
        store: ucanStore,
        exp: expIn(300),
        verifierResolver,
    })
async function loadChapters(signer: EdDSASigner, authorDid: string, email: string) {
    const inv = await invoke(ChapterListCap, signer, authorDid, { email })
    return postInvocation<{ chapters: { name: string }[], version: string, updatedAt: string | null }>('/api/chapters', inv.bytes)
}

async function loadChapter(signer: EdDSASigner, authorDid: string, email: string, slug: string) {
    activeChapterSlug = slug
    const inv = await invoke(ChapterReadCap, signer, authorDid, { email, slug, reviewerDid: signer.did })
    return postInvocation<{ text: string, comments: CommentRow[], hasDiff: boolean, version: number }>(
        `/api/chapters/${slug}`, inv.bytes)
}

async function loadChapterDiff(signer: EdDSASigner, authorDid: string, email: string, slug: string) {
    const inv = await invoke(ChapterReadCap, signer, authorDid, { email, slug, reviewerDid: signer.did })
    return postInvocation<{ slug: string, oldVersion: number, newVersion: number, oldText: string, newText: string }>(
        `/api/chapters/${slug}/diff`, inv.bytes)
}

// ---------- inline markup ----------  
const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const CRITIC = /\{~~.*?~~\}|\{--.*?--\}|\{\+\+.*?\+\+\}|\{>>.*?<<\}/gs
const MD_EM = /\*\S[^*]*\*/g
const INLINE = new RegExp(`${CRITIC.source}|${MD_EM.source}`, 'gs')
const HEADER = /^(#{1,3})\s+(.*)$/

const renderCriticMarkup = (s: string) => s
    .replace(/\{~~(.*?)~>(.*?)~~\}/gs, (_, a, b) => `<del class="rev-del">${esc(a)}</del><ins class="rev-ins">${esc(b)}</ins>`)
    .replace(/\{~~(.*?)~~\}/gs, (_, a) => `<del class="rev-del">${esc(a)}</del>`)
    .replace(/\{--(.*?)--\}/gs, (_, a) => `<del class="rev-del">${esc(a)}</del>`)
    .replace(/\{\+\+(.*?)\+\+\}/gs, (_, a) => `<ins class="rev-ins">${esc(a)}</ins>`)
    .replace(/\{>>(.*?)<<\}/gs, (_, a) => `<span class="rev-comment" title="${esc(a)}">※</span>`)

const renderMarker = (m: string) =>
    m.startsWith('*') ? `<em>${esc(m.slice(1, -1))}</em>` : renderCriticMarkup(m)

// render text containing INLINE markers to HTML (markers become em/critic tags)  
function renderInline(text: string): string {
    const pieces = text.split(INLINE)
    const markers = text.match(INLINE) ?? []
    return pieces.map((p, i) => esc(p) + (markers[i] ? renderMarker(markers[i]) : '')).join('')
}

// headers get class .manuscript-section on h2 — buildSubsectionNavigation depends on it  
function headerHtml(level: number, inner: string) {
    const cls = level === 1 ? 'manuscript-title' : level === 2 ? 'manuscript-section' : 'manuscript-subsection'
    return `<h${level} class="${cls}">${inner}</h${level}>`
}

// ---------- manuscript view ----------  
function parseSentencesIntoSpans(text: string) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })
    let id = 0
    const emit = (content: string) =>
        content.trim() ? `<span class="novel-sentence" data-id="${id++}">${content}</span>` : ''

    return text.split(/\n+/).map(raw => {
        const p = raw.trim()
        if (!p) return ''
        const h = p.match(HEADER)
        if (h) return headerHtml(h[1].length, renderInline(h[2]))

        const pieces = p.split(INLINE)
        const markers = p.match(INLINE) ?? []
        const body = pieces.map((piece, i) =>
            [...segmenter.segment(piece)]
                .filter(seg => seg.segment.trim())
                .map(seg => emit(esc(seg.segment))).join('')
            + (markers[i] ? emit(renderMarker(markers[i])) : '')
        ).join('')
        return `<p style="margin-bottom: 1.5rem; text-indent: 1.5rem; text-align: justify; font-size: 1.15rem; line-height: 1.8;">${body}</p>`
    }).join('')
}

// ---------- diff view (markdown-aware) ----------  
function renderDiffView(oldText: string, newText: string, oldV: number, newV: number) {  
    const lines: string[] = []  
    const segs: { text: string; mark: 'ins' | 'del' | null }[] = []  
    let rawLine = ''  
    let rawNew = ''                                   // FIX: new-side text for sentence segmentation  
    let sentId = 0                                    // FIX: same id sequence as parseSentencesIntoSpans  
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' })  // FIX  
  
    // FIX: wrap rendered segs in .novel-sentence spans whose data-id matches  
    // the ids parseSentencesIntoSpans assigns to newText — so  
    // markCommentedSentences()/sentenceSpan() keep working in diff view.  
    const renderWithSentences = (parts: typeof segs, raw: string) => {  
        const bounds = [...segmenter.segment(raw)]  
            .filter(s => s.segment.trim())  
            .map(s => s.index + s.segment.length)     // end offsets in rawNew  
        let html = '', off = 0, bi = 0, open = false  
        const openSpan = () => { html += `<span class="novel-sentence" data-id="${sentId++}">`; open = true }  
        const closeSpan = () => { html += '</span>'; open = false }  
        for (const s of parts) {  
            let t = s.text  
            while (t.length) {  
                if (!open) openSpan()  
                const isNewSide = s.mark !== 'del'    // unchanged + ins advance rawNew offset  
                const room = isNewSide && bi < bounds.length ? bounds[bi] - off : Infinity  
                const n = Math.min(t.length, room === Infinity ? t.length : room)  
                const chunk = t.slice(0, n); t = t.slice(n)  
                const e = esc(chunk)  
                html += s.mark ? `<${s.mark} class="rev-${s.mark}">${e}</${s.mark}>` : e  
                if (isNewSide) {  
                    off += n  
                    if (bi < bounds.length && off >= bounds[bi]) { closeSpan(); bi++ }  
                }  
            }  
        }  
        if (open) closeSpan()  
        return html  
    }  
  
    const emitLine2 = () => {  
        const raw = rawLine; rawLine = ''  
        const rawN = rawNew; rawNew = ''              // FIX  
        const parts = segs.splice(0)  
        const h = raw.trim().match(HEADER)  
        if (h) {  
            let prefix = raw.trimStart().match(/^#{1,3}\s+/)![0]  
            const inner = parts.map(s => {  
                let t = s.text  
                if (prefix && t.startsWith(prefix.slice(0, t.length))) {  
                    const n = Math.min(t.length, prefix.length)  
                    t = t.slice(n); prefix = prefix.slice(n)  
                }  
                const e = esc(t)  
                return s.mark ? `<${s.mark} class="rev-${s.mark}">${e}</${s.mark}>` : e  
            }).join('')  
            lines.push(headerHtml(h[1].length, inner))   // headers get no sentence spans — same as parseSentencesIntoSpans  
        } else if (raw.trim()) {  
            // FIX: emit sentence spans instead of bare marks  
            lines.push(`<p class="diff-para">${renderWithSentences(parts, rawN)}</p>`)  
        } else {  
            lines.push('')  
        }  
    }  
  
    for (const t of diffWordsWithSpace(oldText, newText)) {  
        const mark = t.added ? 'ins' as const : t.removed ? 'del' as const : null  
        const pieces = t.value.split('\n')  
        pieces.forEach((piece, i) => {  
            if (i > 0) emitLine2()  
            if (piece) {  
                segs.push({ text: piece, mark })  
                rawLine += piece  
                if (mark !== 'del') rawNew += piece   // FIX: feed new-side buffer  
            }  
        })  
    }  
    emitLine2()  
  
    $('text-canvas').innerHTML = `  
      <div class="diff-vertical manuscript-body">  
        <div class="diff-tag">v${oldV} → v${newV}  
          &nbsp;·&nbsp;<a href="#" id="exit-diff">exit diff</a></div>  
        ${lines.join('\n')}  
      </div>`  
  
    $('exit-diff').addEventListener('click', e => {  
        e.preventDefault()  
        renderChapterText(newText, currComments)  
    })  
    buildSubsectionNavigation()  
    markCommentedSentences(currComments)   // FIX: restore 💬/blue highlight on commented sentences  
    renderComments(currComments)           // FIX: keep comment cards clickable (scroll + active-highlight)  
    resetRevisions()  
}

function updateRevisionUI() {
    const hasRevisions = !!document.querySelector('.rev-del, .rev-ins, .rev-comment')
    const hiding = document.body.classList.contains('hide-revisions')
    $('rev-legend')?.classList.toggle('hidden', !hasRevisions || hiding)
    $('toggle-revisions')?.classList.toggle('hidden', !hasRevisions)
}

// entering a new view (chapter or diff) always resets the hide state  
function resetRevisions() {
    document.body.classList.remove('hide-revisions')
    const t = $('toggle-revisions'); if (t) t.textContent = 'Hide changes'
    updateRevisionUI()
}

// ---------- comments ----------  
const sentenceSpan = (id: number) =>
    document.querySelector<HTMLElement>(`.novel-sentence[data-id="${id}"]`)

function renderComments(comments: CommentRow[]) {
    const stream = $('comment-list')
    document.querySelector('.comment-caution')?.remove()  // was accumulating dupes  
    if (document.querySelector('.rev-del, .rev-ins') && comments.length) {
        stream.insertAdjacentHTML('beforebegin',
            '<div class="comment-caution">⚠ This draft has revisions — some notes may point at shifted lines.</div>')
    }
    stream.innerHTML = comments.length ? '' : '<div class="comment-empty">Click on any line…</div>'
    for (const c of comments) {
        const ref = (extra = '') => `<span class="comment-ref">¶ ${c.sentence_id}${extra}</span>`
        const item = document.createElement('div')
        item.className = 'comment-card'
        item.innerHTML = `${ref()}<p>${c.feedback}</p>`
        item.addEventListener('click', () => {
            const span = sentenceSpan(c.sentence_id)
            const stale = !span || Boolean(c.sentence_text && span.textContent!.trim() !== c.sentence_text)
            item.classList.toggle('comment-stale', stale)
            if (stale) item.innerHTML = `${ref(' · stale')}<p>${c.feedback}</p>` +
                (c.sentence_text ? `<small class="stale-ctx">was: "${esc(c.sentence_text.slice(0, 80))}…"</small>` : '')
            if (!span) return  // orphan — nowhere to scroll  
            span.scrollIntoView({ behavior: 'smooth', block: 'center' })
            document.querySelectorAll('.novel-sentence').forEach(x => x.classList.remove('active-highlight'))
            span.classList.add('active-highlight')
        })
        stream.appendChild(item)
    }
}

function markCommentedSentences(comments: CommentRow[]) {
    for (const c of comments) sentenceSpan(c.sentence_id)?.classList.add('has-comment')
}

// ---------- nav / chapter view ----------  
function buildSubsectionNavigation() {
    const sections = document.querySelectorAll<HTMLElement>('.manuscript-section')
    const nav = $('subsection-nav-container'), list = $('subsection-links')
    list.innerHTML = ''
    if (!sections.length) { nav.style.display = 'none'; return }
    sections.forEach((section, i) => {
        section.id = `section-anchor-${i}`
        const li = document.createElement('li')
        li.innerHTML = `<a href="#${section.id}" style="text-decoration:none;color:#4b5563;transition:color .15s;">${section.innerText}</a>`
        li.firstElementChild!.addEventListener('click', e => {
            e.preventDefault(); section.scrollIntoView({ behavior: 'smooth' })
        })
        list.appendChild(li)
    })
    nav.style.display = 'block'
}

function renderChapterText(chapterText: string, comments: CommentRow[]) {
    $('text-canvas').innerHTML =
        `<div id="manuscript-viewport" style="line-height:1.85;font-size:1.15rem;">${parseSentencesIntoSpans(chapterText)}</div>`
    buildSubsectionNavigation()
    markCommentedSentences(comments)
    resetFeedbackUI()
    renderComments(comments)
    resetRevisions()
}

function renderChapterList(chapters: { name: string }[], onSelect: (slug: string) => void) {
    const ul = $('dynamic-chapter-list')
    const sorted = [...chapters].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    ul.innerHTML = ''
    for (const c of sorted) {
        const li = document.createElement('li')
        const a = document.createElement('a')
        a.href = '#'
        a.textContent = c.name.replace('chapter-', '').replace(/-/g, ' ')
            .replace(/\b\w/g, ch => ch.toUpperCase())
        li.dataset.slug = c.name
        a.addEventListener('click', e => { e.preventDefault(); onSelect(c.name) })
        li.appendChild(a); ul.appendChild(li)
    }
}

// ---------- composer ----------  
function selectSentence(element: HTMLElement, id: number) {
    document.querySelectorAll('.novel-sentence').forEach(x => x.classList.remove('active-highlight'))
    element.classList.add('active-highlight')
    selectedSentenceId = id
    const comment = currComments.find(c => c.sentence_id === id)
    const panel = $('comment-composer')
    panel.innerHTML = `  
    <h4 style="margin-bottom:12px;font-size:.95rem;color:#111827;">Leave Note for Sentence #${id}<span><small><a href="#" id="close-composer" style="text-decoration:none">&nbsp;&nbsp;Close</a></small></span></h4>  
    <textarea id="feedback-note" style="width:100%;height:120px;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-family:inherit;margin-bottom:12px;resize:none;" placeholder="Type your edits or critiques here...">${comment ? esc(comment.feedback) : ''}</textarea>  
    <button style="width:100%;background:#111827;color:white;padding:10px;border:none;border-radius:6px;font-weight:500;cursor:pointer;">Save Review Note</button>`
    $('right-sidebar').classList.remove('collapsed')
    panel.querySelector('button:last-of-type')!.addEventListener('click', () => submitLineNote(id))
    $('close-composer').addEventListener('click', e => { e.preventDefault(); resetFeedbackUI() })
}

function resetFeedbackUI() {
    selectedSentenceId = null
    $('comment-composer').innerHTML = ''
}

async function submitLineNote(sId: number) {
    const feedback = ($('feedback-note') as HTMLTextAreaElement).value
    if (!feedback.trim()) { alert('Please type a feedback comment before saving.'); return }
    try {
        const [signer, authorDid, email] =
            await Promise.all([getExistingSigner(), getAuthorDid(), getReviewerEmail()])
        const spanText = sentenceSpan(sId)?.textContent?.trim() ?? ''
        const inv = await invoke(ChapterFeedbackCap, signer, authorDid,
            { email, sentenceId: sId, slug: activeChapterSlug!, feedback, sentenceText: spanText.slice(0, 300) })
        const res = await postInvocation<{ message: string }>('/api/feedback', inv.bytes)
        alert(`Note submitted ${res.message}`)
        currComments.push({ sentence_id: sId, feedback, sentence_text: spanText, created_at: new Date().toISOString() })
        currComments.sort((a, b) => a.sentence_id - b.sentence_id)
        renderComments(currComments)
        markCommentedSentences(currComments)
        resetFeedbackUI()
    } catch (e) {
        alert(`Failed to save feedback: ${e instanceof Error ? e.message : String(e)}`)
    }
}

function showError(msg: string) {
    const s = $('status-message')
    if (s) { s.classList.remove('hidden'); s.textContent = msg }
}

// ---------- auth view ----------  
function showAuthView(onSubmit: (email: string, nonce: string) => Promise<void>) {
    $('main-reader')?.classList.add('hidden')
    $('workspace-container')?.classList.add('hidden')
    $('auth-section')!.classList.remove('hidden')
    $('auth-status-msg')!.textContent =
        'Enter your reviewer email and 6-digit invite code.'

    $('auth-form')!.addEventListener('submit', async e => {
        e.preventDefault()
        const email = ($('email') as HTMLInputElement).value
        const nonce = ($('nonce') as HTMLInputElement).value
        const statusEl = $('status-message')
        statusEl.classList.remove('hidden')
        statusEl.textContent = 'Verifying…'
        try { await onSubmit(email, nonce) }
        catch (err: any) { statusEl.textContent = err.message }
    })

    // LAZY: only now register a DID + poll — first-time users cost nothing  
    const link = $('show-device-link')
    const linkSection = $('device-link-section')
    if (link && linkSection) {
        link.addEventListener('click', e => {
            e.preventDefault()
            linkSection.classList.remove('hidden')
            link.closest('.link-device-toggle')?.classList.add('hidden')
            startDeviceLink()
        })
    } else {
        console.warn('[auth] device-link elements missing:', { link, linkSection })
    }
}

// ---------- device link: new device side ----------  
async function startDeviceLink() {
    const signer = await getOrCreateSigner()
    const statusEl = $('device-link-status')
    try {
        const res = await fetch('/api/link/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ did: signer.did }),
        })
        const { code } = await res.json() as { code: string }
        $('device-link-code')!.textContent = code.replace(/(\d{3})(\d{3})/, '$1 $2')
        $('device-did')!.textContent = `${signer.did.slice(0, 24)}…${signer.did.slice(-12)}`

        const deadline = Date.now() + 5 * 60 * 1000
        const poll = setInterval(async () => {
            try {
                if (Date.now() > deadline) {
                    clearInterval(poll)
                    statusEl.textContent = 'Code expired — reload to get a new one.'
                    return
                }
                const res = await fetch(`/api/link/claim/${signer.did}?code=${code}`)
                const data = LinkClaimResponseSchema.parse(await res.json())
                if (data.pending) return
                const { token, parentToken, email, authorWorkerDelegation, authorDID, workerDID } = data
                clearInterval(poll)
                statusEl.textContent = 'Approved — activating…'
                await acceptDeviceDelegation(token, parentToken, authorWorkerDelegation, workerDID, authorDID, email)
                window.location.reload()
            } catch (e: any) { statusEl.textContent = `Poll error: ${e.message}` }
        }, 4000)
    } catch (e: any) { statusEl.textContent = e.message }
}

// ---------- device link: authorized device side ----------  
function openApproveModal(email: string) {
    const modal = $('device-approve-modal')
    const codeInput = $('approve-code-input') as HTMLInputElement
    const steps = {
        code: $('approve-step-code'),
        confirm: $('approve-step-confirm'),
        done: $('approve-step-done'),
    }
    const showStep = (k: keyof typeof steps) =>
        Object.entries(steps).forEach(([key, el]) => el.classList.toggle('hidden', key !== k))
    const close = () => modal.classList.add('hidden')
    const result = (msg: string) => { $('approve-result')!.textContent = msg; showStep('done') }

    let pendingDid: string | null = null

    modal.classList.remove('hidden')
    codeInput.value = ''
    showStep('code')
    codeInput.focus()

    $('approve-cancel-btn')!.onclick = close
    $('approve-back-btn')!.onclick = () => showStep('code')
    $('approve-close-btn')!.onclick = close
    modal.onclick = e => { if (e.target === modal) close() }  // backdrop click  

    $('approve-lookup-btn')!.onclick = async () => {
        const code = codeInput.value.replace(/\s/g, '')
        if (!/^\d{6}$/.test(code)) { codeInput.focus(); return }
        try {
            const lookup = await fetch(`/api/link/lookup/${code}`)
            if (!lookup.ok) {
                result('Code expired or invalid — have the other device request a new one.')
                return
            }
            const { did } = LinkLookupResponseSchema.parse(await lookup.json())
            pendingDid = did
            $('approve-new-did')!.textContent = did
            showStep('confirm')
        } catch (e: any) { result(`Lookup failed: ${e.message}`) }
    }

    $('approve-confirm-btn')!.onclick = async () => {
        if (!pendingDid) return
        try {
            const s = await getExistingSigner()
            const authorDid = await getAuthorDid()
            const delegation = await ChapterCap.delegate({
                iss: s,
                aud: parse(pendingDid).did,
                sub: parse(authorDid).did,
                pol: [['==', '.email', email]],
                exp: expIn(60 * 60 * 24 * 365),
                store: ucanStore,
            })
            console.log(`[app] policy: ${JSON.stringify(delegation.pol)}`)
            const p = await rawIdb.get('wr-delegation')
            if (typeof p !== 'string' || !p.startsWith('gl')) {
                result('Your session is still in legacy format - sign in once more and try again')
                return
            }
            const r = await fetch('/api/link/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: delegation.toString(),
                    parentDelegation: p,
                    did: pendingDid,
                    email,
                }),
            })
            result(r.ok
                ? 'Device approved — it will finish setup automatically.'
                : `Approval failed: ${await r.text()}`)
        } catch (e: any) { result(`Link failed: ${e.message}`) }
    }
}

// ---------- workspace chrome ----------  
function showWorkspaceView(email: string, did: string) {
    $('auth-section')?.classList.add('hidden')
    $('workspace-container')?.classList.remove('hidden')
    $('main-reader')?.classList.remove('hidden')
    $('subsection-container')?.classList.remove('hidden')
    const badge = $('token-status-badge')
    if (badge) {
        badge.textContent = `✓ Authorized to: ${email} · ${did.slice(0, 6)}…${did.slice(-3)}`
        badge.title = did
        badge.classList.replace('badge-inactive', 'badge-active')
        badge.style.cursor = 'pointer'
    }
    const dlink = $('device-link')
    if (dlink) {
        dlink.classList.remove('hidden')
        dlink.addEventListener('click', () => openApproveModal(email))
    }
}

const fmtUpdated = (iso: string | null) =>  
  iso ? new Intl.DateTimeFormat('en-US', {  
    month: 'short', day: 'numeric',  
    hour: 'numeric', minute: '2-digit',  
    timeZone: 'America/New_York', timeZoneName: 'short',  
  }).format(new Date(iso)) : null 

// ---------- bootstrap ----------  
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const signer = await getOrCreateSigner()
        if (!await hasDelegation()) {
            showAuthView(async (email, nonce) => {
                await verifyNonce(signer.did, email, nonce)
                window.location.reload()
            })
            return
        }

        const authorDid = await getAuthorDid()
        const email = await getReviewerEmail()
        showWorkspaceView(email, signer.did)

        // canvas clicks → select sentence  
        $('text-canvas')!.addEventListener('click', e => {
            const span = (e.target as HTMLElement).closest<HTMLElement>('.novel-sentence')
            if (span) selectSentence(span, Number(span.dataset.id))
        })

        // sidebar toggles  
        $('toggle-toc')!.addEventListener('click', () =>
            $('left-sidebar')!.classList.toggle('collapsed'))
        $('toggle-comments')!.addEventListener('click', () =>
            $('right-sidebar')!.classList.toggle('collapsed'))
        if (window.matchMedia('(max-width: 700px)').matches)
            $('right-sidebar')!.classList.add('collapsed')

        // Hide/Show changes — now delegates to updateRevisionUI so the  
        // legend hides together with the revision marks  
        $('toggle-revisions')!.addEventListener('click', e => {
            const hiding = document.body.classList.toggle('hide-revisions')
                ; (e.currentTarget as HTMLElement).textContent = hiding ? 'Show changes' : 'Hide changes'
            updateRevisionUI()
        })

        // Compare Versions → markdown-aware diff + rebuilt anchors  
        $('compare-versions')!.addEventListener('click', async () => {
            if (!activeChapterSlug) return
            try {
                const d = await loadChapterDiff(signer, authorDid, email, activeChapterSlug)
                renderDiffView(d.oldText, d.newText, d.oldVersion, d.newVersion)
            } catch (e: any) {
                showError(e.message)  // e.g. "only one version exists"  
            }
        })

        // chapter list  
        const { chapters, version, updatedAt } = await loadChapters(signer, authorDid, email)
        const stamp = fmtUpdated(updatedAt)
        $('draft-version')!.innerHTML = `Version: ${version}${stamp ? ` · updated ${stamp}` : ''}`
        renderChapterList(chapters, slug =>
            loadChapter(signer, authorDid, email, slug)
                .then(({ text, comments, hasDiff }) => {
                    currComments = comments
                    renderChapterText(text, comments)
                    $('compare-versions')?.classList.toggle('hidden', !hasDiff)
                })
                .catch(err => showError(err.message)))

        // initial chapter  
        if (chapters.length > 0) {
            $('text-canvas')!.innerHTML =
                '<p style="color:#6b7280;text-align:center;">Securely loading chapter...</p>'
            const { text, comments, hasDiff } =
                await loadChapter(signer, authorDid, email, chapters[0].name)
            currComments = comments
            renderChapterText(text, comments)
            $('compare-versions')?.classList.toggle('hidden', !hasDiff)
        }
    } catch (err) {
        console.error('Hydration error:', err)
        showError(err instanceof Error ? err.message : String(err))
    }
})