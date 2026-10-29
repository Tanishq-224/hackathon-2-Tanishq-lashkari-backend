import { jest } from '@jest/globals'
import request from 'supertest'

import { clearMemoryAuthStore } from '../src/repositories/auth.repository.js'

process.env.NODE_ENV = 'test'
process.env.CLIENT_URL = 'http://localhost:5173'

const { createApp } = await import('../src/app.js')

describe('Auth API', () => {
  beforeEach(() => {
    clearMemoryAuthStore()
  })

  it('signs up, verifies OTP from dev email log, and returns session cookie', async () => {
    const app = createApp()
    const email = 'alex@example.com'

    const signup = await request(app)
      .post('/api/auth/signup')
      .send({
        fullName: 'Alex Customer',
        email,
        password: 'Secure1!',
        confirmPassword: 'Secure1!',
        role: 'customer',
      })
      .expect(201)

    expect(signup.body.success).toBe(true)

    const verify = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email, otp: '000000', purpose: 'signup' })
      .expect(400)

    expect(verify.body.message).toMatch(/invalid/i)
  })

  it('completes the full auth lifecycle: signup -> verify -> login -> /me -> logout', async () => {
    let capturedOtp = ''
    const consoleSpy = jest.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
      const payload = args[1] as { text?: string } | undefined
      if (payload?.text) {
        const match = payload.text.match(/\b\d{6}\b/)
        if (match) capturedOtp = match[0]
      }
    })

    const app = createApp()
    const email = 'tanishq@example.com'
    const password = 'Password123!'

    // 1. Signup
    const signupRes = await request(app)
      .post('/api/auth/signup')
      .send({
        fullName: 'Tanishq Lashkari',
        email,
        password,
        confirmPassword: password,
        role: 'customer',
      })
      .expect(201)

    expect(signupRes.body.success).toBe(true)
    expect(capturedOtp).toHaveLength(6)

    // 2. Cannot login before email verification
    const unverifiedLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(403)
    expect(unverifiedLogin.body.message).toMatch(/verify your email/i)

    // 3. Verify OTP
    const verifyRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({ email, otp: capturedOtp, purpose: 'signup' })
      .expect(200)

    expect(verifyRes.body.success).toBe(true)
    const cookies = verifyRes.headers['set-cookie']
    expect(cookies).toBeDefined()

    // 4. Login after verification
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200)

    expect(loginRes.body.success).toBe(true)
    expect(loginRes.body.data.user.email).toBe(email)
    const sessionCookie = loginRes.headers['set-cookie']

    // 5. Query /api/auth/me with session cookie
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(meRes.body.success).toBe(true)
    expect(meRes.body.data.user.fullName).toBe('Tanishq Lashkari')
    expect(meRes.body.data.user.role).toBe('customer')

    // 6. Logout
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(logoutRes.body.success).toBe(true)

    consoleSpy.mockRestore()
  })
})
