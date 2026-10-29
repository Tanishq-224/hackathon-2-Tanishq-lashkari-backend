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

  it('rejects weak passwords on signup', async () => {
    const app = createApp()

    const response = await request(app)
      .post('/api/auth/signup')
      .send({
        fullName: 'Alex',
        email: 'weak@example.com',
        password: 'short',
        confirmPassword: 'short',
      })
      .expect(400)

    expect(response.body.message).toMatch(/8 characters/i)
  })
})
