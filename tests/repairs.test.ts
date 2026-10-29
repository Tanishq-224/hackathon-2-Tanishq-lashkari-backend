import { jest } from '@jest/globals'
import request from 'supertest'

import { clearMemoryAuthStore } from '../src/repositories/auth.repository.js'
import { clearMemoryRepairStore } from '../src/repositories/repair.repository.js'

process.env.NODE_ENV = 'test'
process.env.CLIENT_URL = 'http://localhost:5173'

const { createApp } = await import('../src/app.js')

describe('Repair Requests API (Phase 3)', () => {
  beforeEach(() => {
    clearMemoryAuthStore()
    clearMemoryRepairStore()
  })

  async function createVerifiedUser(
    app: ReturnType<typeof createApp>,
    email = `customer-${Math.random().toString(36).substring(2, 8)}@example.com`,
    role: 'customer' | 'vendor' = 'customer',
  ): Promise<string> {
    let capturedOtp = ''
    const spy = jest
      .spyOn(console, 'info')
      .mockImplementation((...args: unknown[]) => {
        const payload = args[1] as { text?: string } | undefined
        if (payload?.text) {
          const match = payload.text.match(/\b\d{6}\b/)
          if (match) capturedOtp = match[0]
        }
      })

    await request(app).post('/api/auth/signup').send({
      fullName: 'Customer Test',
      email,
      password: 'Password123!',
      confirmPassword: 'Password123!',
      role,
    })

    const verifyRes = await request(app).post('/api/auth/verify-otp').send({
      email,
      otp: capturedOtp,
      purpose: 'signup',
    })

    spy.mockRestore()
    return verifyRes.headers['set-cookie']
  }

  it('rejects unauthenticated requests with 401', async () => {
    const app = createApp()

    const postRes = await request(app).post('/api/repairs').send({
      deviceType: 'phone',
      brand: 'Apple',
      modelName: 'iPhone 14',
      issueCategory: 'screen',
      description: 'Screen is cracked completely.',
    })

    expect(postRes.status).toBe(401)

    const getRes = await request(app).get('/api/repairs')
    expect(getRes.status).toBe(401)
  })

  it('allows an authenticated customer to create, list, and view repair requests', async () => {
    const app = createApp()
    const sessionCookie = await createVerifiedUser(app)

    // 1. Create a repair request
    const createRes = await request(app)
      .post('/api/repairs')
      .set('Cookie', sessionCookie)
      .send({
        deviceType: 'phone',
        brand: 'Apple',
        modelName: 'iPhone 14 Pro',
        issueCategory: 'screen',
        description: 'Screen shattered after falling on asphalt, digitizer still partially responds.',
        urgency: 'high',
        images: [
          { url: 'https://example.com/broken-screen.jpg', publicId: 'img_1' },
        ],
      })
      .expect(201)

    expect(createRes.body.success).toBe(true)
    expect(createRes.body.data.repair.brand).toBe('Apple')
    expect(createRes.body.data.repair.status).toBe('submitted')
    const repairId = createRes.body.data.repair.id

    // 2. List customer's requests
    const listRes = await request(app)
      .get('/api/repairs')
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(listRes.body.success).toBe(true)
    expect(listRes.body.data.repairs).toHaveLength(1)
    expect(listRes.body.data.repairs[0].id).toBe(repairId)

    // 3. View request details
    const detailRes = await request(app)
      .get(`/api/repairs/${repairId}`)
      .set('Cookie', sessionCookie)
      .expect(200)

    expect(detailRes.body.success).toBe(true)
    expect(detailRes.body.data.repair.modelName).toBe('iPhone 14 Pro')
  })

  it('prevents another customer from viewing someone elses repair request', async () => {
    const app = createApp()
    const user1Cookie = await createVerifiedUser(app, 'user1@example.com')
    const user2Cookie = await createVerifiedUser(app, 'user2@example.com')

    const createRes = await request(app)
      .post('/api/repairs')
      .set('Cookie', user1Cookie)
      .send({
        deviceType: 'laptop',
        brand: 'Dell',
        modelName: 'XPS 15',
        issueCategory: 'battery',
        description: 'Battery drains in under 20 minutes when unplugged.',
      })
      .expect(201)

    const repairId = createRes.body.data.repair.id

    // User 2 attempts to view User 1's request
    const unauthorizedRes = await request(app)
      .get(`/api/repairs/${repairId}`)
      .set('Cookie', user2Cookie)
      .expect(403)

    expect(unauthorizedRes.body.message).toMatch(/not authorized/i)
  })

  it('lists assigned repairs for vendors after customer selects their estimate', async () => {
    const app = createApp()
    const customerCookie = await createVerifiedUser(app, 'cust-vendor-list@example.com', 'customer')
    const vendorCookie = await createVerifiedUser(app, 'vendor-list@example.com', 'vendor')

    const createRes = await request(app)
      .post('/api/repairs')
      .set('Cookie', customerCookie)
      .send({
        deviceType: 'tablet',
        brand: 'Samsung',
        modelName: 'Galaxy Tab S8',
        issueCategory: 'screen',
        description: 'Display has hairline cracks along the bezel.',
      })
      .expect(201)

    const repairId = createRes.body.data.repair.id

    const estimateRes = await request(app)
      .post(`/api/repairs/${repairId}/estimates`)
      .set('Cookie', vendorCookie)
      .send({
        minCost: 120,
        maxCost: 180,
        turnaroundTime: '2-3 days',
        warrantyMonths: 3,
        notes: 'OEM-grade panel replacement.',
      })
      .expect(201)

    const estimateId = estimateRes.body.data.estimate.id

    await request(app)
      .post(`/api/repairs/${repairId}/select-estimate`)
      .set('Cookie', customerCookie)
      .send({ estimateId })
      .expect(200)

    const vendorListRes = await request(app)
      .get('/api/repairs')
      .set('Cookie', vendorCookie)
      .expect(200)

    expect(vendorListRes.body.data.repairs).toHaveLength(1)
    expect(vendorListRes.body.data.repairs[0].id).toBe(repairId)
    expect(vendorListRes.body.data.repairs[0].status).toBe('vendor_selected')
  })

  it('validates image uploads and handles data URI fallback', async () => {
    const app = createApp()
    const sessionCookie = await createVerifiedUser(app)

    const uploadRes = await request(app)
      .post('/api/repairs/upload-image')
      .set('Cookie', sessionCookie)
      .send({
        imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      })
      .expect(200)

    expect(uploadRes.body.success).toBe(true)
    expect(uploadRes.body.data.url).toBeDefined()
  })
})
