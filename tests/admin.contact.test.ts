import { jest } from '@jest/globals'
import request from 'supertest'

import { clearMemoryAuthStore } from '../src/repositories/auth.repository.js'
import { clearMemoryContactStore } from '../src/repositories/contactMessage.repository.js'

process.env.NODE_ENV = 'test'
process.env.CLIENT_URL = 'http://localhost:5173'
process.env.ADMIN_EMAILS = 'admin@repairex.test'

const { createApp } = await import('../src/app.js')

async function signupVerifyLogin(app: ReturnType<typeof createApp>, email: string) {
  let capturedOtp = ''
  const consoleSpy = jest.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
    const payload = args[1] as { text?: string } | undefined
    if (payload?.text) {
      const match = payload.text.match(/\b\d{6}\b/)
      if (match) capturedOtp = match[0]
    }
  })

  const password = 'Password123!'

  await request(app)
    .post('/api/auth/signup')
    .send({
      fullName: 'Platform Admin',
      email,
      password,
      confirmPassword: password,
      role: 'customer',
    })
    .expect(201)

  await request(app)
    .post('/api/auth/verify-otp')
    .send({ email, otp: capturedOtp, purpose: 'signup' })
    .expect(200)

  consoleSpy.mockRestore()

  const login = await request(app).post('/api/auth/login').send({ email, password }).expect(200)

  const cookie = login.headers['set-cookie']?.[0]
  expect(cookie).toBeDefined()
  return cookie as string
}

describe('Admin contact inbox API', () => {
  beforeEach(() => {
    clearMemoryAuthStore()
    clearMemoryContactStore()
  })

  it('stores public contact messages and lets admin list and update them', async () => {
    const app = createApp()

    await request(app)
      .post('/api/contact')
      .send({
        fullName: 'Alex Customer',
        email: 'alex@example.com',
        topic: 'platform',
        message: 'I need help understanding how vendor estimates work on Repairex.',
      })
      .expect(201)

    const adminSession = await signupVerifyLogin(app, 'admin@repairex.test')

    const list = await request(app)
      .get('/api/admin/contact-messages')
      .set('Cookie', adminSession)
      .expect(200)

    expect(list.body.data.items).toHaveLength(1)
    expect(list.body.data.items[0].email).toBe('alex@example.com')

    const messageId = list.body.data.items[0].id as string

    const patch = await request(app)
      .patch(`/api/admin/contact-messages/${messageId}`)
      .set('Cookie', adminSession)
      .send({ status: 'in_progress', internalNote: 'Follow up by email tomorrow.' })
      .expect(200)

    expect(patch.body.data.message.status).toBe('in_progress')
  })

  it('returns 403 for non-admin users', async () => {
    const app = createApp()
    const customerCookie = await signupVerifyLogin(app, 'customer@repairex.test')

    await request(app)
      .get('/api/admin/contact-messages')
      .set('Cookie', customerCookie)
      .expect(403)
  })
})
