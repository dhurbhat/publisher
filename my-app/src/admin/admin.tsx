import { Hono } from "hono";
import { Store } from "iso-ucan/store";
import * as Capabilities from "./capabilities"
import { Bindings, Variables } from "hono/types";
import { AdminLogin } from "../components/layout";
import { Delegation } from "iso-ucan/delegation";

// components/AdminDashboard.tsx
import { FC } from 'hono/jsx'
import { Invocation } from "iso-ucan/invocation";

export const AdminDashboard: FC = () => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Client-Side Delegation Admin Panel</title>
        <style>{`
          body { font-family: system-ui, sans-serif; background: #f8fafc; padding: 2rem; display: flex; justify-content: center; }
          .card { background: white; padding: 2.5rem; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); width: 100%; max-width: 600px; }
          textarea { width: 100%; box-sizing: border-box; padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px; font-family: monospace; font-size: 0.85rem; margin-bottom: 1.25rem; }
          button { width: 100%; padding: 0.85rem; background: #0f172a; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
          .status { font-weight: bold; margin-bottom: 1rem; color: #2563eb; font-size: 0.9rem; word-break: break-all; }
          label { font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.5rem; color: #475569; }
        `}</style>
      </head>
      <body>
        <div class="card">
          <h1>Zero-Secret Admin Panel</h1>
          <p style="color: #64748b; font-size:0.9rem;">Operations are signed completely inside your browser using short-lived keys.</p>
          
          <div id="status" class="status">🔄 Generating isolated tab session identity...</div>

          <div id="workspace">
            <label for="ucan_chain"><strong>1. Paste UCAN Delegation Chain (AUTHOR ➔ ADMIN) JWT</strong></label>
            <textarea id="ucan_chain" rows={4} placeholder="eyJhbGciOi..."></textarea>

            <label for="emails"><strong>2. Reviewer Email Addresses (One per line)</strong></label>
            <textarea id="emails" rows={4} placeholder="reviewer@example.com"></textarea>

            <button id="btn-submit">Sign & Submit Invocation</button>
          </div>
        </div>

        <script type="module">{`
          import { Ed25519Signer } from 'https://esm.sh';
          import { Invocation } from 'https://esm.sh';

          let tabSessionSigner = null;

          async function init() {
            tabSessionSigner = await Ed25519Signer.generate();
            document.getElementById('status').innerText = '⚡ Ephemeral Session DID: ' + tabSessionSigner.did();
          }

          document.getElementById('btn-submit').addEventListener('click', async () => {
            const authorAdminJWT = document.getElementById('ucan_chain').value.trim();
            const emails = document.getElementById('emails').value.split('\\n').map(e => e.trim()).filter(Boolean);

            if (!authorAdminJWT) return alert('Please provide the parent UCAN delegation string.');
            if (emails.length === 0) return alert('Please enter at least one email address.');

            try {
              // Create the live Invocation matching the exact spec structure.
              // We pass the parent delegation string into the proofs array argument.
              const invocation = await Invocation.create({
                issuer: tabSessionSigner,
                audience: 'did:web:your-app-domain.com',
                cmd: '/admin',
                args: { action: 'invite' },
                proofs: [authorAdminJWT], 
                lifetimeInSeconds: 300
              });

              // Send BOTH the signed invocation JWT and the raw proof string array
              // so the server has the literal tokens needed to map against the payload CIDs.
              const res = await fetch('/admin/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  invocation: invocation.toString(),
                  proofs: [authorAdminJWT],
                  emails: emails
                })
              });

              const result = await res.json();
              if (result.success) {
                alert('🎉 Invocation processed successfully!');
              } else {
                alert('❌ Server Rejected Invocation: ' + result.error);
              }

            } catch (err) {
              alert('Cryptographic Signing Error: ' + err.message);
            }
          });

          init();
        `}</script>
      </body>
    </html>
  )
}

export function registerChapterRoutes(app: Hono<{ Bindings: Bindings; Variables: Variables }>) {
    app.get('/admin', (c) => {
        const errorCode = c.req.query('error')
        let errorMessage = ''
        if (errorCode === 'bad_token') errorMessage = 'The token structure is invalid or corrupt.'
        if (errorCode === 'unauthorized') errorMessage = 'Verification failed. Cryptographic DIDs or capabilities do not match.'
        if (errorCode === 'expired') errorMessage = 'This authorization token has expired.'

        return c.html(
            <AdminLogin error={ errorMessage } />
        )
    })
    app.post('/admin', async (c) => {
        const body = await c.req.parseBody()
        const tokenStr = body.ucan_token

        if (typeof tokenStr !== 'string' || !tokenStr.trim()) {
            return c.redirect('/admin?error=bad-token')
        }
        try {
            const delegation = Delegation.fromString
            const cap = Capabilities.AdminCap.validate
        }
    })
app.get('/admin/dashboard', (c) => c.html(<AdminDashboard />))

app.post('/admin/invite', async (c) => {
  const { invocation: invocationJWT, proofs, emails } = await c.req.json()

  if (!Array.isArray(emails) || emails.length === 0) {
    return c.json({ error: 'Missing or empty target reviewer email parameters.' }, 400)
  }

  if (!Array.isArray(proofs) || proofs.length === 0) {
    return c.json({ error: 'Missing required parent proof string items for compilation.' }, 400)
  }

  try {
    // 1. RECONSTITUTE PROOF OBJECT ENGINES FIRST
    // Convert raw proof string arrays into fully typed Delegation instances
    const parsedDelegations = proofs.map(tokenStr => Delegation.fromString(tokenStr))

    // 2. PARSE INVOCATION USING THE CORRECT STATIC .from() ASYNC METHOD
    // We pass the raw string and explicitly map the supporting delegations context array matching your interface options signature
    const textEncoder = new TextEncoder()
    const invocationBytes = textEncoder.encode(invocationJWT)
    
    const parsedInvocation = await Invocation.from({
      bytes: invocationBytes,
      delegations: parsedDelegations
    })

    // 3. TARGET OPERATIONAL CAPABILITY VALUE INTERPOLATION
    // Verify command parameter keys directly using the accurate type-safe payload properties
    if (parsedInvocation.payload.cmd !== '/admin' || parsedInvocation.payload.args.action !== 'invite') {
      return c.json({ error: 'Rejected: Invocation fields do not match targeted /admin invite claims.' }, 403)
    }

    // 4. TIMING CHECK
    const currentEpoch = Math.floor(Date.now() / 1000)
    if (parsedInvocation.payload.exp && currentEpoch >= parsedInvocation.payload.exp) {
      return c.json({ error: 'Rejected: Invocation operation processing window has elapsed.' }, 401)
    }

    // 5. TRACE ROOTS USING THE EXTRACTED DELEGATIONS CONTAINER ARRAY
    const targetRootDelegation = parsedDelegations[0]

    if (!targetRootDelegation) {
      return c.json({ error: 'Rejected: Structural validation failure across supplied token records.' }, 401)
    }

    // Use .validate() safely on capabilities embedded in the reconstructed root delegation wrapper
    let rootIsAuthorized = false
    for (const cap of targetRootDelegation.payload.capabilities) {
      const validated = AdminCap.validate(cap)
      if (validated.ok && validated.value.cmd === '/admin' && validated.value.with.action === 'invite') {
        rootIsAuthorized = true
        break
      }
    }

    if (!rootIsAuthorized) {
      return c.json({ error: 'Rejected: Root credential payload lacks validation clearances.' }, 403)
    }

    // Final security check: Ensure root chain authority aligns perfectly with your Author public DID record binding
    if (targetRootDelegation.payload.iss !== c.env.AUTHOR_DID) {
      return c.json({ error: 'Rejected: Upstream delegation issuer does not match trusted Author boundaries.' }, 401)
    }

    // SUCCESS: Trust metrics pass verification successfully.
    console.log('Successfully confirmed authorization tracking data block:', emails)
    return c.json({ success: true, count: emails.length })

  } catch (err) {
    console.error('UCAN execution engine validation crash:', err)
    return c.json({ error: 'Verification pipeline error: ' + (err as Error).message }, 401)
  }
})
}