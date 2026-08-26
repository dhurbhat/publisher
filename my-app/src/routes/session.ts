import { Hono } from 'hono'
import type { Bindings } from '../index'

export function registerSessionRoutes(app: Hono<{ Bindings: Bindings }>) {
  app.post('/api/activate-session', async (c) => {
    const { email, nonce } = await c.req.json()
    if (!email || !nonce) {
      return c.json({ success: false, message: 'Missing email or nonce' }, 400)
    }

    const rawPacket = await c.env.READER_SESSION_KV.get(`nonce:${email}`)
    if (!rawPacket) {
      return c.json({ success: false, message: 'Invite not valid or expired' }, 403)
    }

    const packet = JSON.parse(rawPacket)
    if (packet.nonce !== nonce) {
      return c.json({ success: false, message: 'PIN mismatch' }, 403)
    }

    await c.env.READER_SESSION_KV.delete(`nonce:${email}`)
    return c.json({ success: true, ucan: packet.ucan, message: 'Nonce verified successfully' })
  })

  app.post('/api/store-seed-nonce', async (c) => {
    const url = new URL(c.req.url)
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return c.json({ success: false, message: 'Unauthorized: Local development only' }, 403)
    }

    const { email, payload } = await c.req.json()
    if (!email || !payload) {
      return c.json({ success: false, message: 'Missing email or payload' }, 400)
    }

    let serializedPayload: string
    try {
      serializedPayload = typeof payload === 'string'
        ? JSON.stringify(JSON.parse(payload))
        : JSON.stringify(payload)
    } catch (error) {
      return c.json({ success: false, message: 'Invalid payload text string encoding' }, 400)
    }

    await c.env.READER_SESSION_KV.put(`nonce:${email}`, serializedPayload, { expirationTtl: 900 })
    return c.json({ success: true, message: 'Nonce and UCAN stored successfully' })
  })
}