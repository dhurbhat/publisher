import { Hono } from 'hono'
import { requireChapterCap } from '../middleware/require-chapter-cap.js'
import { ChapterListCap, ChapterReadCap } from '../../shared/chapter-cap.js'
import { Bindings } from '../../index.js'

export interface CommentRow {
    sentence_id: number,
    feedback: string,
    created_at: string
    sentence_text: string
}

interface SceneEntry { slug: string; title: string }
interface ChapterEntry { slug: string; title: string; scenes: SceneEntry[] }

// Reassemble a chapter: "# Title" + "## SceneTitle\n\n<body>" per scene —  
// mirrors the merge + header injection that publish.ts used to do.  
async function loadChapterText(kv: KVNamespace, version: number, slug: string) {
    const manifest = await kv.get<ChapterEntry[]>(`v${version}/manifest`, 'json')
    const chapter = manifest?.find(c => c.slug === slug)
    if (!chapter) return null

    const keys = chapter.scenes.map(s => `v${version}/${slug}/${s.slug}`)
    const texts = await kv.get(keys) // batched get → Map<string, string|null>  

    const body = chapter.scenes.map(s => {
        const text = texts.get(`v${version}/${slug}/${s.slug}`) ?? ''
        const hasHeader = text.startsWith(`# ${s.title}`) ||
            text.startsWith(`## ${s.title}`) ||
            text.startsWith(`${s.title}\n`)
        return `${hasHeader ? '' : `## ${s.title}\n\n`}${text}`
    }).join('\n\n')

    return `# ${chapter.title}\n\n${body}`
}

async function latestVersion(kv: KVNamespace) {
    return parseInt((await kv.get('meta:latest')) ?? '0', 10)
}

export function registerChapterRoutes(app: Hono<{ Bindings: Bindings }>) {
    app.post(
        '/api/chapters',
        requireChapterCap(ChapterListCap),
        async (c) => {
            const v = await latestVersion(c.env.NOVEL_TEXT_KV)
            const manifest = await c.env.NOVEL_TEXT_KV
                .get<ChapterEntry[]>(`v${v}/manifest`, 'json')
            const chapters = (manifest ?? []).map(ch => ({ name: ch.slug }))
            return c.json({ version: v, chapters })
        }
    )

    app.post(
        '/api/chapters/:slug',
        requireChapterCap(ChapterReadCap),
        async (c) => {
            const slug = c.req.param('slug')
            const args = c.get('chapterArgs') as { email: string; slug: string, reviewerDid: string }

            if (args.slug !== slug) {
                return c.json({ error: 'chapter slug mismatch' }, 403)
            }

            // ?version=N reads an older snapshot; default = latest  
            const requested = c.req.query('version')
            const v = requested ? parseInt(requested, 10) : await latestVersion(c.env.NOVEL_TEXT_KV)

            const text = await loadChapterText(c.env.NOVEL_TEXT_KV, v, slug)
            if (text === null) {
                return c.json({ error: 'chapter not found' }, 404)
            }
            const resultSet = await c.env.DB.prepare(
                `SELECT sentence_id, feedback, created_at FROM feedback WHERE chapter_slug = ? AND reader_did = ? ORDER BY sentence_id`
            ).bind(args.slug, args.reviewerDid).all<CommentRow>()

            return c.json({ slug, version: v, text, comments: resultSet.results })
        }
    )

    // Side-by-side diff payload: previous version vs latest (or ?from=N&to=M)  
    app.post(
        '/api/chapters/:slug/diff',
        requireChapterCap(ChapterReadCap),
        async (c) => {
            const slug = c.req.param('slug')
            const args = c.get('chapterArgs') as { email: string; slug: string, reviewerDid: string }
            if (args.slug !== slug) {
                return c.json({ error: 'chapter slug mismatch' }, 403)
            }

            const latest = await latestVersion(c.env.NOVEL_TEXT_KV)
            const to = parseInt(c.req.query('to') ?? String(latest), 10)
            const from = parseInt(c.req.query('from') ?? String(to - 1), 10)
            if (from < 1) {
                return c.json({ error: 'only one version exists' }, 404)
            }

            const [oldText, newText] = await Promise.all([
                loadChapterText(c.env.NOVEL_TEXT_KV, from, slug),
                loadChapterText(c.env.NOVEL_TEXT_KV, to, slug),
            ])
            if (oldText === null || newText === null) {
                return c.json({ error: 'chapter missing in one version' }, 404)
            }

            return c.json({ slug, oldVersion: from, newVersion: to, oldText, newText })
        }
    )
}