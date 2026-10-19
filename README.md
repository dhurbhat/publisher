# The Novel Workspace  
  
A private, UCAN-secured manuscript review platform built as a Cloudflare Worker  
(Hono + KV + D1). Publishers upload chapter text to KV; invited reviewers  
authenticate with a one-time 6-digit PIN and receive browser-scoped UCAN  
delegations — no accounts, no passwords.  
  
> **License:** Source code is MIT (see `LICENSE`). Manuscript content served  
> through this app is CC BY-NC-ND 4.0 with AI-use restrictions  
> (see `LICENSE-MANUSCRIPT`).  
  
## Architecture at a glance  
  
| Binding | Purpose |  
|---|---|  
| `NOVEL_TEXT_KV` | Compiled chapter text, keyed by slug |  
| `READER_SESSION_KV` | Invite nonces (`invite:<pin>`), device-link codes/grants |  
| `UCAN_STORE_KV` | UCAN delegation proof chains (`ucan:*` keys) |  
| `DB` (D1) | Sentence-level reviewer feedback |  
  
Secrets/vars: 
- `AUTHOR_DID` : Author/Publisher's Decentralized ID,
- `AUTHOR_WORKER_DELEGATION` : Delegated authorization to Cloudflare Worker,
- `WORKER_PRIVATE_KEY` : Cloudflare Worker's private key (stored in Secrets),  
- `WORKER_DID` : Cloudflare Worker's Decentralized ID
— see `Bindings` in `src/index.tsx` for specific details  
  
## How authorization works: UCAN, and why reviewers never "sign up"  
  
### UCAN in one paragraph  
  
UCAN (User-Controlled Authorization Networks) is a decentralized, capability-based authorization model. 
Instead of a server checking "who is logged in and what may they do" against a database, authority is expressed as 
**cryptographically signed tokens** that can be **delegated** from one keypair (DID) to another in a chain: 
`Author → Worker → Reviewer → Reviewer's second device`. 
Each request carries a signed **invocation** plus a **proof chain** of delegations; the server verifies the signatures  
and that the chain roots at a trusted DID — no session table, no OAuth, no accounts.  
  
### How this app uses it  
  
```text  
Author (AUTHOR_DID — trust anchor, pinned in worker env)  
  └── Author → Worker        AUTHOR_WORKER_DELEGATION (minted once, out-of-band)  
        └── Worker → Reviewer  minted by /api/verify-nonce after PIN check  
              └── Reviewer → Reviewer-Device-2   minted by /api/link/approve  
```  
  
- **Capabilities** are declared in `src/shared/chapter-cap.ts` as a hierarchy: the parent `ChapterCap` (`cmd: '/chapter'`) is what gets delegated, and it automatically covers the narrower commands `/chapter/list`, `/chapter/read`, `/chapter/feedback`.  
- **Minting**: `/api/verify-nonce` checks the invite PIN, then calls `ChapterCap.delegate()` with the reviewer's DID as audience, the author's  
  DID as subject, an email policy (`['==', '.email', reviewerEmail]`), and a 1-year expiry.  
- **Verifying**: every protected route is wrapped in `requireChapterCap(...)`, which decodes the base64 invocation, resolves the proof chain from `UCAN_STORE_KV` (via `CloudflareUcanStore`), and  
  explicitly asserts the root delegation's issuer equals `AUTHOR_DID` — a self-signed chain alone is not enough.  
- **Storage**: proofs live server-side in `UCAN_STORE_KV` (`ucan:` prefix); the reviewer's own copy of their delegations lives in browser IndexedDB.  
  
### No registration, no passwords, no accounts  
  
Reviewers are never asked to create an account. There is no user table — the D1 database only stores feedback rows keyed by DID.  
  
- **Identity = a keypair, not an account.** On first page load the browser silently generates an Ed25519 keypair (`EdDSASigner`) and stores it in  
  IndexedDB under `reviewer-signer`. The public half — a `did:key:...` identifier — *is* the reviewer's identity. It never leaves the device  
  except as a public DID string.  
- **The PIN is a bootstrap, not a password.** The 6-digit invite PIN is a one-time capability exchange: prove you received the publisher's invite,  
  get a delegation in return. The nonce is deleted on use and can't be replayed. After that, the PIN is never needed again.  
- **Nothing to remember, nothing to phish.** Authorization lives in the browser's local state (IndexedDB). Reading on a new browser or device  
  doesn't mean "logging in again" — it means obtaining a *new delegation* approved by an already-authorized device (see Section 4).  
- **Revocation-friendly by default**: delegations carry expirations, and `CloudflareUcanStore` maps them onto native KV TTLs, so capability  
  records physically evaporate instead of lingering.  
  
---  
  
## 1. Publisher: preparing & publishing the manuscript  
(until multi-publisher support lands, this deploys *your own* Worker)  
  
1. **Fork/clone this repo** and `cd my-app && npm install`.  
2. **Create Cloudflare resources**:  
   ```bash  
   npx wrangler login  
   npx wrangler kv namespace create NOVEL_TEXT_KV  
   npx wrangler kv namespace create READER_SESSION_KV  
   npx wrangler kv namespace create UCAN_STORE_KV  
   npx wrangler d1 create novel-feedback-db  
   npx wrangler d1 execute novel-feedback-db --file=./schema.sql --remote  
   ```  
   Paste the returned IDs into `wrangler.jsonc` (`kv_namespaces[].id`,  
   `d1_databases[].database_id`).  
3. **Generate the author/worker identity**:  
   ```bash  
   npx tsx mint-author.ts  
   ```  
   `mint-author.ts` generates EdDSA keypairs for the Author and Worker,  
   mints the root `Author→Worker` `ChapterCap` delegation, uploads it to  
   `UCAN_STORE_KV`, sets the four worker secrets (`WORKER_PRIVATE_KEY`,  
   `AUTHOR_DID`, `WORKER_DID`, `AUTHOR_WORKER_DELEGATION`), and writes  
   `.dev.vars` for local `wrangler dev`.  
  
   > ⚠️ **CAUTION — never commit private keys to GitHub.**  
   > `mint-author.ts` writes `author_private.seed` and `worker_private.seed`  
   > (in the repo *parent* directory) plus `.dev.vars` — all three contain  
   > plaintext private key material. Add them to `.gitignore` immediately:  
   > ```  
   > author_private.seed  
   > worker_private.seed  
   > .dev.vars  
   > ```  
   > If a seed is ever pushed, rotate keys by re-running `mint-author.ts`  
   > and redeploying — any delegation chain rooted at the old key must be  
   > considered compromised.  
  
4. **Structure the manuscript** as numbered chapter folders containing numbered scene `.md` files:  
  
   | Sample | File type | Description |  
   |---|---|---|  
   | `Manuscript` | folder | Root folder for your manuscript |  
   | ` 01 The Opening` | folder | Chapter folder for all scenes |  
   | `  01 Arrival.md` | file | Scene within a chapter |  
   | `  02 Discovery.md` | file | Scene within a chapter |  
   | ` 02 The Aftermath` | folder | Next chapter folder |  
   | `   01 Interrogation.md` | file | Scene within a chapter |  
  
   `publish.ts` sorts folders/files numerically, strips numbering prefixes, injects chapter titles as `#` and scene titles as `##`, merges scenes,  
   and uploads each chapter as `chapter-<slug>` to `NOVEL_TEXT_KV`.  
5. **Publish**:  
   ```bash  
   npx tsx publish.ts /path/to/Manuscript --remote   # production KV  
   npx tsx publish.ts /path/to/Manuscript            # local preview  
   ```  
6. **Deploy**: `npx wrangler deploy`. Your worker URL (e.g. `https://my-app.<account>.workers.dev`) is the link you share.  
  
## 2. Publisher: inviting friends & family  
  
Each invite is a single-use 6-digit PIN mapped to a reviewer email in `READER_SESSION_KV` under `invite:<pin>` (30-day TTL). Don't hand-write  
`wrangler` commands — use the generator:  
  
```bash  
npx tsx invite-generator.ts --emails mom@example.com,dad@example.com,bff@example.com  
```  
  
This emits two files:  
  
| Output | Contents |  
|---|---|  
| `invites.sh` | Executable batch of `npx wrangler kv key put 'invite:<pin>' '<email>'` commands |  
| `invites-manifest.txt` | `email ⇥ pin ⇥ activation-url` per reviewer, for your records |  
  
Then run `./invites.sh` to write the invites to KV (add `--local` for the local dev namespace, or `--api` to write directly via the Cloudflare REST  
API — requires `CLOUDFLARE_ACCOUNT_ID`, `CF_API_TOKEN`, `READER_SESSION_KV_ID` env vars).  
  
Send each reviewer their PIN + the worker URL from the manifest. They must enter the **same email** you generated the invite for — `verify-nonce`  
rejects mismatched email/PIN pairs, and the PIN is consumed on first use.  
  
> ⚠️ **CAUTION — never commit `invites.sh` or `invites-manifest.txt` to  
> GitHub.** Both are generated output files containing reviewer emails and  
> their live activation PINs. They should be listed in `.gitignore`:  
> ```  
> invites.sh  
> invites-manifest.txt  
> ```  
  
## 3. Reviewer: first-time authorization  
  
1. Open the worker URL. The app generates an `EdDSASigner` keypair in the browser's IndexedDB (keys never leave the device).  
2. Enter your email + 6-digit PIN → the client POSTs `{ reviewerDid, reviewerEmail, nonce }` to `/api/verify-nonce`.  
3. The worker validates the nonce against `READER_SESSION_KV`, consumes it (single use), and mints a `Worker→Reviewer` `ChapterCap` UCAN delegation  
   (policy-pinned to your email, 1-year expiry), rooted in the out-of-band `Author→Worker` delegation.  
4. Delegations are stored in IndexedDB; you can now list chapters (`/api/chapters`), read them (`/api/chapters/:slug`), and leave  
   sentence-level feedback (`/api/feedback`) — all via signed UCAN invocations verified by `requireChapterCap` against the pinned  
   `AUTHOR_DID` trust anchor.  
  
## 4. Reviewer: linking another browser or device  
  
Authorization is per-browser (keys live in IndexedDB). To add a device without a new PIN:  
  
1. **New device**: open the URL → click "Already authorized on another device?" → it POSTs `/api/link/request` and displays a 6-digit code  
   (TTL: 5 min) while polling `/api/link/claim/:did`.  
2. **Old (authorized) device**: click 🔗 Link in the toolbar → enter the code → the app looks up `/api/link/lookup/:code`, shows the new device's  
   DID, and on Approve mints a `Reviewer→Reviewer` `ChapterCap` delegation and POSTs it to `/api/link/approve`.  
3. **New device**: its poll picks up the grant (`linkgrant:<did>`), `acceptDeviceDelegation()` stores the full proof chain  
   (`Author→Worker`, `Worker→Reviewer`, `Reviewer→NewDevice`) in IndexedDB, and the page reloads authorized.  
  
---  
  
## Development  
  
```bash  
npx wrangler dev          # Miniflare local runtime  
npx wrangler deploy       # production  
npm run cf-typegen        # regenerate worker-configuration.d.ts  
```  
  
## `.gitignore` quick reference  
  
```gitignore  
# Private key material — never commit  [header-2](#header-2)
author_private.seed  
worker_private.seed  
.dev.vars  
# Generated invite outputs — contain live PINs + reviewer emails  [header-3](#header-3)
invites.sh  
invites-manifest.txt  
```
