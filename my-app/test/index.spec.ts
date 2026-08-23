// Replace: import { env } from 'cloudflare:test'
// With this official import pathway:
import { env } from 'cloudflare:workers'
import { describe, it, expect, beforeEach } from 'vitest'
import app from '../src/index'

describe('Novel Endpoint Protection Unit Tests', () => {
  beforeEach(async () => {
    // Prime the mock local KV environment with your test chapter text
    await env.NOVEL_TEXT_KV.put('chapter-1', 'This is secret novel text content.')
  })

  it('should block requests completely missing an Authorization header', async () => {
    const res = await app.request('/api/chapter/chapter-1', { method: 'GET' })
    expect(res.status).toBe(401)
    expect(await res.text()).toContain('Unauthorized')
  })

  it('should reject non-Bearer token formats outright', async () => {
    const res = await app.request('/api/chapter/chapter-1', {
      method: 'GET',
      headers: { 'Authorization': 'Basic dGVzdDp0ZXN0' }
    })
    expect(res.status).toBe(401)
  })
})
