import crypto from 'node:crypto'  
import * as fs from 'node:fs'  
import process from 'node:process'  
  
// ── Config ──────────────────────────────────────────────────────────────  
const KV_BINDING = 'READER_SESSION_KV'  
// For --api mode: the namespace *ID* (32-char hex), NOT the binding name  
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || ''  
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || ''  
const KV_NAMESPACE_ID = process.env.READER_SESSION_KV_ID || ''  
const NONCE_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days  
const BASE_DOMAIN = process.env.BASE_DOMAIN || ''  
  
const KNOWN = new Set(['--emails', '--author', '--local', '--remote', '--api', '--help', '-h'])  
const USAGE = `  
invite-generator — create reviewer invites (nonce → email) in READER_SESSION_KV  
  
Usage:  
  npx tsx invite-generator.ts --emails <list> [--author <email>] [--local|--remote|--api]  
  
Required:  
  --emails a@x.com,b@y.com   Comma-separated reviewer emails. One 6-digit  
                             nonce is generated per email.  
  
Options:  
  --author you@x.com         Mark this email as the author. Writes a persistent  
                             'author:email' KV key (no TTL); verify-nonce records  
                             the browser DID of whoever activates it into  
                             'author:dids', which gates the feedback-review  
                             endpoints. Must be one of --emails.  
  --local                    Emit wrangler commands targeting local KV (DEFAULT).  
  --remote                   Emit wrangler commands targeting remote KV.  
  --api                      Write directly via Cloudflare REST API instead of  
                             emitting invites.sh. Requires env vars below.  
  
Environment:  
  BASE_DOMAIN                Required. e.g. https://manuscript-reviewer.<acct>.workers.dev  
  CLOUDFLARE_ACCOUNT_ID      (--api only)  
  CLOUDFLARE_API_TOKEN       (--api only) needs KV write permission  
  READER_SESSION_KV_ID       (--api only) namespace ID, not binding name  
  
Output:  
  invites.sh                 Executable wrangler script (skipped in --api mode)  
  invites-manifest.txt       email<TAB>nonce<TAB>activation-url — gitignore this!  
  
Examples:  
  npx tsx invite-generator.ts --emails friend@x.com --remote  
  npx tsx invite-generator.ts --emails you@x.com,friend@y.com --author you@x.com --remote  
  npx tsx invite-generator.ts --emails a@x.com --api`  
  
const CF_KV_URL =  
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}` +  
  `/storage/kv/namespaces/${KV_NAMESPACE_ID}/values`  
  
type Mode = 'local' | 'remote' | 'api'  
  
function parseArgs(): { emails: string[]; authorEmail: string | null; mode: Mode } {  
  const args = process.argv.slice(2)  
  
  if (args.includes('--help') || args.includes('-h')) {  
    console.log(USAGE)  
    process.exit(0)  
  }  
  const unknown = args.filter(a => a.startsWith('-') && !KNOWN.has(a))  
  if (unknown.length) {  
    console.error(`\n❌ Unknown flag(s): ${unknown.join(', ')}\n${USAGE}`)  
    process.exit(1)  
  }  
  
  let emailsStr = ''  
  let authorEmail: string | null = null  
  let mode: Mode = 'local'   // safe default — remote writes must be explicit  
  
  for (let i = 0; i < args.length; i++) {  
    switch (args[i]) {  
      case '--emails':  
        if (!args[i + 1]) { console.error('--emails requires a value'); process.exit(1) }  
        emailsStr = args[++i]  
        break  
      case '--author':  
        if (!args[i + 1]) { console.error('--author requires a value'); process.exit(1) }  
        authorEmail = args[++i]  
        break  
      case '--local':  mode = 'local';  break  
      case '--remote': mode = 'remote'; break  
      case '--api':    mode = 'api';    break  
    }  
  }  
  
  if (!emailsStr) {  
    console.error(USAGE)  
    process.exit(1)  
  }  
  const emails = emailsStr.split(',').map(e => e.trim()).filter(Boolean)  
  if (authorEmail && !emails.includes(authorEmail)) {  
    console.error('--author email must be one of --emails')  
    process.exit(1)  
  }  
  return { emails, authorEmail, mode }  
}  
  
function shellQuote(s: string): string {  
  return `'${s.replace(/'/g, `'\\''`)}'`  
}  
  
/** Direct write to Cloudflare KV via REST API — no worker endpoint involved. */  
async function writeViaApi(key: string, value: string, ttl?: number): Promise<void> {  
  const url = `${CF_KV_URL}/${key}` + (ttl ? `?expiration_ttl=${ttl}` : '')  
  const res = await fetch(url, {  
    method: 'PUT',  
    headers: {  
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,  
      'Content-Type': 'text/plain',  
    },  
    body: value,  
  })  
  if (!res.ok) {  
    throw new Error(`Cloudflare API ${res.status}: ${await res.text()}`)  
  }  
}  
  
async function run() {  
  const { emails, authorEmail, mode } = parseArgs()  
  
  if (mode === 'api' && (!ACCOUNT_ID || !CLOUDFLARE_API_TOKEN || !KV_NAMESPACE_ID)) {  
    console.error('--api requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, READER_SESSION_KV_ID')  
    process.exit(1)  
  }  
  if (!BASE_DOMAIN) {  
    console.error('MANDATORY Set BASE_DOMAIN, e.g. export BASE_DOMAIN=https://manuscript-reviewer.<youraccount>.workers.dev')  
    process.exit(1)  
  }  
  
  const script: string[] = ['#!/usr/bin/env bash', 'set -euo pipefail', '']  
  const manifest: string[] = []  
  const target = mode === 'local' ? ' --local' : ' --remote'  
  
  for (const email of emails) {  
    const nonce = crypto.randomInt(100000, 999999).toString()  
  
    if (mode === 'api') {  
      try {  
        await writeViaApi(`invite:${nonce}`, email, NONCE_TTL_SECONDS)  
        console.log(`✅ ${email} — written via API`)  
      } catch (err) {  
        console.error(`❌ ${email} — ${err}`)  
        continue  
      }  
    } else {  
      script.push(  
        `npx wrangler kv key put ${shellQuote(`invite:${nonce}`)} ${shellQuote(email)}` +  
        ` --binding ${KV_BINDING} --ttl ${NONCE_TTL_SECONDS}${target}`  
      )  
    }  
  
    const activationUrl = `${BASE_DOMAIN}/?email=${encodeURIComponent(email)}`  
    manifest.push(`${email}\t${nonce}\t${activationUrl}`)  
    console.log(`🔗 ${email}  nonce=${nonce}  ${activationUrl}`)  
  }  
  
  // mark which invited email is the author — verify-nonce uses this to  
  // record the author's browser DID on first activation  
  if (authorEmail) {  
    if (mode === 'api') {  
      await writeViaApi('author:email', authorEmail)   // no TTL — must outlive invites  
      console.log(`👑 ${authorEmail} marked as author (via API)`)  
    } else {  
      script.push(  
        `npx wrangler kv key put "author:email" ${shellQuote(authorEmail)} --binding ${KV_BINDING}${target}`  
      )  
      console.log(`👑 ${authorEmail} marked as author (in invites.sh)`)  
    }  
  }  
  
  if (mode !== 'api') {  
    fs.writeFileSync('invites.sh', script.join('\n') + '\n', { mode: 0o755 })  
    console.log(`\nWrote invites.sh — run: ./invites.sh`)  
  }  
  fs.writeFileSync('invites-manifest.txt', manifest.join('\n') + '\n')  
  console.log('Wrote invites-manifest.txt (gitignore this!)')  
}  
  
run()