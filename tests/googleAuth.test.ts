import { jest } from '@jest/globals'
import type { OAuth2Client } from 'google-auth-library'
import request from 'supertest'

process.env.NODE_ENV = 'test'
process.env.CLIENT_URL = 'http://localhost:5173'
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'

import {
  clearMemoryAuthStore,
  createUser,
  findUserByEmail,
  findUserByGoogleId,
} from '../src/repositories/auth.repository.js'
import {
  setCustomGoogleVerifier,
  verifyGoogleIdToken,
} from '../src/services/googleAuth.service.js'

const { createApp } = await import('../src/app.js')

describe('Phase 2/Auth: Secure Google Identity Services Sign-In', () => {
  const app = createApp()

  beforeEach(() => {
    clearMemoryAuthStore()
    setCustomGoogleVerifier(null)
  })

  afterAll(() => {
    setCustomGoogleVerifier(null)
  })

  it('rejects missing or malformed credential payloads with 400', async () => {
    const res = await request(app)
      .post('/api/auth/google')
      .send({})
      .expect(400)

    expect(res.body.success).toBe(false)
    expect(res.body.message).toBeDefined()
  })

  it('authenticates a new user with a valid Google ID token, creating a verified customer account and session cookie', async () => {
    setCustomGoogleVerifier(async () => ({
      googleId: 'google-sub-12345',
      email: 'newgoogleuser@example.com',
      name: 'Google User',
      emailVerified: true,
    }))

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid.google.jwt.token' })
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.user.email).toBe('newgoogleuser@example.com')
    expect(res.body.data.user.role).toBe('customer')
    expect(res.headers['set-cookie']).toBeDefined()

    // Verify persisted in repository with googleId
    const stored = await findUserByGoogleId('google-sub-12345')
    expect(stored).not.toBeNull()
    expect(stored?.emailVerified).toBe(true)
    expect(stored?.googleId).toBe('google-sub-12345')
  })

  it('safely links Google ID to an existing email/password account without creating duplicates', async () => {
    // 1. Existing local user created previously
    const existing = await createUser({
      fullName: 'Local User',
      email: 'localuser@example.com',
      passwordHash: 'hashed_password',
      role: 'customer',
    })

    setCustomGoogleVerifier(async () => ({
      googleId: 'google-sub-99999',
      email: 'localuser@example.com',
      name: 'Local User Google',
      emailVerified: true,
    }))

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid.google.jwt.token' })
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.user.id).toBe(existing.id)

    // User is now linked with Google ID and verified
    const updated = await findUserByEmail('localuser@example.com')
    expect(updated?.googleId).toBe('google-sub-99999')
    expect(updated?.emailVerified).toBe(true)
  })

  it('recognizes returning Google users by googleId directly', async () => {
    setCustomGoogleVerifier(async () => ({
      googleId: 'google-sub-returning',
      email: 'returning@example.com',
      name: 'Returning User',
      emailVerified: true,
    }))

    // First login
    await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid.token.one' })
      .expect(200)

    // Second login
    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'valid.token.two' })
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.user.email).toBe('returning@example.com')
  })

  it('rejects tokens when audience mismatch occurs', async () => {
    const mockClient = {
      verifyIdToken: jest.fn<OAuth2Client['verifyIdToken']>().mockRejectedValue(
        new Error('Wrong recipient, payload audience != requiredAudience'),
      ),
    } as unknown as OAuth2Client

    await expect(
      verifyGoogleIdToken('fake.token.for.audience', mockClient),
    ).rejects.toThrow(/audience mismatch/i)
  })

  it('rejects Google accounts where email is unverified', async () => {
    const mockClient = {
      verifyIdToken: jest.fn<OAuth2Client['verifyIdToken']>().mockResolvedValue({
        getPayload: () => ({
          aud: 'test-client-id.apps.googleusercontent.com',
          sub: 'google-sub-unverified',
          email: 'unverified@example.com',
          email_verified: false,
          name: 'Unverified Google',
        }),
      } as unknown as ReturnType<OAuth2Client['verifyIdToken']> extends Promise<infer U> ? U : never),
    } as unknown as OAuth2Client

    await expect(
      verifyGoogleIdToken('fake.token.for.unverified', mockClient),
    ).rejects.toThrow(/not verified by Google/i)
  })
})
