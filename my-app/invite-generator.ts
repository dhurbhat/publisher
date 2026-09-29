import crypto from 'node:crypto'  
import * as fs from 'node:fs'  
import process from 'node:process'  
  
// ── Config ──────────────────────────────────────────────────────────────  
const KV_BINDING = 'READER_SESSION_KV'  
// For --api mode: the namespace *ID* (32-char hex), NOT the binding name  
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || ''  
const CF_API_TOKEN = process.env.CF_API_TOKEN || ''  
const KV_NAMESPACE_ID = process.env.READER_SESSION_KV_ID || ''  
const NONCE_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days  
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'https://workers.dev'  
  
const CF_KV_URL =  
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}` +  
  `/storage/kv/namespaces/${KV_NAMESPACE_ID}/values`  
  
function parseArgs(): { emails: string[]; mode: 'local' | 'wrangler' | 'api' } {  
  const args = process.argv.slice(2)  
  let emailsStr = ''  
  let mode: 'local' | 'wrangler' | 'api' = 'wrangler'  
  for (let i = 0; i < args.length; i++) {  
    if (args[i] === '--emails' && args[i + 1]) emailsStr = args[i + 1]  
    if (args[i] === '--local') mode = 'local'  
    if (args[i] === '--api') mode = 'api'  
  }  
  if (!emailsStr) {  
    console.error('Usage: npx tsx invite-generator.ts --emails a@x.com,b@y.com [--local|--api]')  
    process.exit(1)  
  }  
  return { emails: emailsStr.split(',').map((e) => e.trim()), mode }  
}  
  
function shellQuote(s: string): string {  
  return `'${s.replace(/'/g, `'\\''`)}'`  
}  
  
/** Direct write to Cloudflare KV via REST API — no worker endpoint involved. */  
async function writeViaApi(nonce: string, email: string): Promise<void> {  
  const res = await fetch(  
    `${CF_KV_URL}/invite:${nonce}?expiration_ttl=${NONCE_TTL_SECONDS}`,  
    {  
      method: 'PUT',  
      headers: {  
        Authorization: `Bearer ${CF_API_TOKEN}`,  
        'Content-Type': 'text/plain',  
      },  
      body: email,  
    }  
  )  
  if (!res.ok) {  
    throw new Error(`Cloudflare API ${res.status}: ${await res.text()}`)  
  }  
}  
  
async function run() {  
  const { emails, mode } = parseArgs()  
  
  if (mode === 'api' && (!ACCOUNT_ID || !CF_API_TOKEN || !KV_NAMESPACE_ID)) {  
    console.error('--api requires CLOUDFLARE_ACCOUNT_ID, CF_API_TOKEN, READER_SESSION_KV_ID')  
    process.exit(1)  
  }  
  
  const script: string[] = ['#!/usr/bin/env bash', 'set -euo pipefail', '']  
  const manifest: string[] = []  
  
  for (const email of emails) {  
    const nonce = crypto.randomInt(100000, 999999).toString()  
    const key = `invite:${nonce}`  
  
    if (mode === 'api') {  
      try {  
        await writeViaApi(nonce, email)  
        console.log(`✅ ${email} — written via API`)  
      } catch (err) {  
        console.error(`❌ ${email} — ${err}`)  
        continue  
      }  
    } else {  
      // Emit wrangler command instead of writing
      script.push(  
  `npx wrangler kv key put ${shellQuote(`invite:${nonce}`)} ${shellQuote(email)} --binding ${KV_BINDING} --ttl ${NONCE_TTL_SECONDS} --local`  
)
    //   const cmd =  
    //     `echo ${shellQuote(email)} | npx wrangler kv key put ${shellQuote(key)}` +  
    //     ` --binding ${KV_BINDING} --ttl ${NONCE_TTL_SECONDS}` +  
    //     (mode === 'local' ? ' --local' : ' --remote')  
    //   script.push(cmd)  
    }  
  
    const activationUrl = `${BASE_DOMAIN}/?email=${encodeURIComponent(email)}`  
    manifest.push(`${email}\t${nonce}\t${activationUrl}`)  
    console.log(`🔗 ${email}  nonce=${nonce}  ${activationUrl}`)  
  }  
  
  if (mode !== 'api') {  
    fs.writeFileSync('invites.sh', script.join('\n') + '\n', { mode: 0o755 })  
    console.log(`\nWrote invites.sh — run: ./invites.sh`)  
  }  
  fs.writeFileSync('invites-manifest.txt', manifest.join('\n') + '\n')  
  console.log('Wrote invites-manifest.txt (gitignore this!)')  
}  
  
run()