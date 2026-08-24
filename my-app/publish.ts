import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

function compileAndPublish() {
  const args = process.argv.slice(2)
  const targetPath = args[0]
  const isRemote = args.includes('--remote')

  if (!targetPath) {
    console.log('\n❌ Error: Missing target directory path.')
    console.log('👉 Usage: npx tsx publish-chapter.ts <path-to-Manuscript> [--remote]\n')
    process.exit(1)
  }

  const resolvedPath = path.resolve(targetPath)
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
    console.error(`\n❌ Error: Manuscript directory not found at "${targetPath}"\n`)
    process.exit(1)
  }

  const manuscriptEntries = fs.readdirSync(resolvedPath, { withFileTypes: true })
  const chapterFolders = manuscriptEntries
    .filter(entry => entry.isDirectory())
    // Ensure folders sort chronologically by their new numeric prefixes
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

  console.log(`\n📚 Found ${chapterFolders.length} Ordered Chapter folder(s)...`)
  const destinationFlag = isRemote ? '--remote' : '--local'
  
  const tempDir = path.join(resolvedPath, '.kv_build_temp')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir)

  chapterFolders.forEach(folder => {
    const rawFolderName = folder.name; // e.g., "01 The SOS Event"
    const folderPath = path.join(resolvedPath, rawFolderName)

    // Gather and sort sub-scene section markdown files chronologically
    const mdFiles = fs.readdirSync(folderPath)
      .filter(file => file.endsWith('.md'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    if (mdFiles.length === 0) return;

    // HELPER: Strip sorting prefixes (like "01 ", "01_", "01-") cleanly for slugs
    // const cleanChapterName = rawFolderName.replace(/^\d+[\s_.-]*/, '')
    const cleanSlug = 'chapter-' + rawFolderName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    console.log(`\n📖 Compiling Chapter: "${rawFolderName}" (${mdFiles.length} scenes merged)`)

    // Glue sections together into a single master chapter file text stream
    const combinedContent = mdFiles.map(file => {
      const rawFileName = path.basename(file, '.md')
      // Strip sorting prefix from the scene section filename for a clean header
      const cleanSceneTitle = rawFileName.replace(/^\d+[\s_.-]*/, '')
      const fileText = fs.readFileSync(path.join(folderPath, file), 'utf8')
      
      // Inject the clean scene section title as a Markdown Subtitle (##)
      const trimmedText = fileText.trim()
            // FIXED: Only inject the '## Title' if the text doesn't already start with that exact header
      const alreadyHasHeader = trimmedText.startsWith(`# ${cleanSceneTitle}`) || 
                               trimmedText.startsWith(`## ${cleanSceneTitle}`) ||
                               trimmedText.startsWith(`${cleanSceneTitle}\n`)
      const headerPrefix = alreadyHasHeader ? '' : `## ${cleanSceneTitle}\n\n`
      return `${fileText.trim()}`
    }).join('\n\n') // Merge smoothly with paragraph gaps

    const tempFilePath = path.join(tempDir, `${cleanSlug}.txt`)
    fs.writeFileSync(tempFilePath, combinedContent, 'utf8')

    try {
      console.log(`🚀 Uploading merged timeline ➡️ KV Key: "${cleanSlug}"`)
      const command = `npx wrangler kv key put "${cleanSlug}" --path="${tempFilePath}" --binding=NOVEL_TEXT_KV ${destinationFlag}`
      execSync(command, { stdio: 'ignore' })
    } catch (error: any) {
      console.error(`❌ Failed to push "${cleanChapterName}":`, error.message)
    }
  })

  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log('\n🏁 CORE MANUSCRIPT TIMELINE INGESTED SUCCESSFULLY.\n')
}

compileAndPublish()
