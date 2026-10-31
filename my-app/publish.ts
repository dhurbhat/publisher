import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

interface SceneEntry { slug: string, title: string }
interface ChapterEntry { slug: string, title: string, scenes: SceneEntry[] }

const USAGE = `  
👉 Usage: npx tsx publish.ts <path-to-Manuscript> [options]  
  
Arguments:  
  <path-to-Manuscript>   Root folder containing numbered chapter folders  
                         (e.g. "01 The Opening/") with numbered scene .md files.  
  
Options:  
  --remote               Write to production KV (NOVEL_TEXT_KV).  
                         Default is --local (wrangler dev preview namespace).  
  --update-latest        Overwrite the current latest version in place instead  
                         of creating v{n+1}. Requires meta:latest >= v2, since  
                         v-1 must survive as the diff/rollback baseline.  
  --help, -h             Show this message.  
`
const KNOWN = new Set(['--remote', '--update-latest', '--help', '-h'])


function kvPut(key: string, source: { path?: string, value?: string }, destinationFlag: string) {
  const src = source.path !== undefined ? `--path="${source.path}"` : `"${source.value}"`
  execSync(`npx wrangler kv key put "${key}" ${src} --binding=NOVEL_TEXT_KV ${destinationFlag}`, { stdio: 'ignore' })
}

function compileAndPublish() {
  const args = process.argv.slice(2)
  const targetPath = args.find(a => !a.startsWith('-'))
  const isRemote = args.includes('--remote')
  const updatedLatest = args.includes('--update-latest')

  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE)
    process.exit(0)
  }
  const unknown = args.filter(a => a.startsWith('-') && !KNOWN.has(a))
  if (unknown.length) {
    console.error(`\n❌ Unknown flag(s): ${unknown.join(', ')}\n${USAGE}`)
    process.exit(1)
  }

  if (!targetPath) {
    console.error('\n❌ Error: Missing target directory path.')
    console.log(USAGE)
    process.exit(1)
  }

  const resolvedPath = path.resolve(targetPath)
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
    console.error(`\n❌ Error: Manuscript directory not found at "${targetPath}"\n`)
    console.log(USAGE)
    process.exit(1)
  }

  const destinationFlag = isRemote ? '--remote' : '--local'
  let version = 1
  let existing = 0

  try {
    const out = execSync(`npx wrangler kv key get "meta:latest" --binding=NOVEL_TEXT_KV ${destinationFlag}`,
      { encoding: 'utf-8' }).trim()
    existing = parseInt(out, 10) || 0
    version = updatedLatest ? existing : existing + 1
  } catch {
    console.log(`--> No original version number found. Resetting to ${version}`)
  }

  if (updatedLatest && existing < 2) {
    console.error(`\n❌ --update-latest needs latest >= v2 (found v${existing}).`)
    console.error('👉 Publish a new version first, or drop the flag.\n')
    process.exit(1)
  }
  console.log(updatedLatest ? 'Updating latest' + ` version ${version}` : 'Creating new' + ` version ${version}`);

  const manuscriptEntries = fs.readdirSync(resolvedPath, { withFileTypes: true })
  const chapterFolders = manuscriptEntries
    .filter(entry => entry.isDirectory())
    // Ensure folders sort chronologically by their new numeric prefixes
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  console.log(`\n📚 Found ${chapterFolders.length} Ordered Chapter folder(s)...`)

  const tempDir = path.join(resolvedPath, '.kv_build_temp')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

  const manifest: ChapterEntry[] = []

  chapterFolders.forEach(folder => {
    const rawFolderName = folder.name; // e.g., "01 The SOS Event"
    const folderPath = path.join(resolvedPath, rawFolderName)
    const normalizedFolderName = rawFolderName
      .replace(/^\d+[\s_.-]*/, '')
      .trim()
      .toLowerCase()

    // Gather and sort sub-scene section markdown files chronologically
    const mdFiles = fs.readdirSync(folderPath)
      .filter(file => file.endsWith('.md'))
      .filter(file => {
        const normalizedFileName = path.basename(file, '.md')
          .replace(/^\d+[\s_.-]*/, '')
          .trim()
          .toLowerCase()

        return normalizedFileName !== normalizedFolderName
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    if (mdFiles.length === 0) return;

    // HELPER: Strip sorting prefixes (like "01 ", "01_", "01-") cleanly for slugs
    // const cleanChapterName = rawFolderName.replace(/^\d+[\s_.-]*/, '')
    const cleanSlug = 'chapter-' + rawFolderName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    const chapterTitle = rawFolderName.replace(/^\d+[\s_.-]*/, '').trim()
    console.log(`\n📖 Compiling Chapter: "${rawFolderName}" (${mdFiles.length} scenes)`)
    const scenes: SceneEntry[] = []
    for (const file of mdFiles) {
      const rawFileName = path.basename(file, '.md')
      // Strip sorting prefix from the scene section filename for a clean header
      const cleanSceneTitle = rawFileName.replace(/^\d+[\s_.-]*/, '').trim()
      const sceneSlug = cleanSceneTitle.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
      const sourceText = fs.readFileSync(path.join(folderPath, file), 'utf8').trim()
      const sourceLines = sourceText.split(/\r?\n/)

      const norm = (s: string) => s.replace(/^#+\s*/, '').trim().toLowerCase()
      const titles = new Set([norm(chapterTitle), norm(cleanSceneTitle)])
      let li = 0
      // drop leading lines that restate chapter OR scene title, with or without '#'  
      while (li < sourceLines.length && sourceLines[li].trim() &&
        titles.has(norm(sourceLines[li]))) {
        li++
      }
      const fileText = sourceLines.slice(li).join('\n').trim()

      const sceneTempPath = path.join(tempDir, `${cleanSlug}--${sceneSlug}.txt`)
      fs.writeFileSync(sceneTempPath, fileText, 'utf8')
      const key = `v${version}/${cleanSlug}/${sceneSlug}`
      try {
        kvPut(key, { path: sceneTempPath }, destinationFlag)
        console.log(`  ➡️  ${key}`)
      } catch (error: any) { console.error(`  ❌ Failed to push "${key}":`, error.message) }
      scenes.push({ slug: sceneSlug, title: cleanSceneTitle })
    }
    manifest.push({ slug: cleanSlug, title: chapterTitle, scenes })
  })

  // ---- Write manifest + bump pointer LAST (atomic-ish: readers flip only after all scenes are in) ----  
  const manifestPath = path.join(tempDir, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  kvPut(`v${version}/manifest`, { path: manifestPath }, destinationFlag)
  kvPut('meta:latest', { value: String(version) }, destinationFlag)

  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log('\n🏁 CORE MANUSCRIPT TIMELINE INGESTED SUCCESSFULLY.\n')
}

compileAndPublish()
