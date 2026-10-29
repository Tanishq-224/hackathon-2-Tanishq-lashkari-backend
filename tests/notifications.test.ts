import { jest } from '@jest/globals'
import request from 'supertest'

import { clearMemoryAuthStore } from '../src/repositories/auth.repository.js'
import { clearMemoryEstimateStore } from '../src/repositories/estimate.repository.js'
import { clearMemoryNotificationStore } from '../src/repositories/notification.repository.js'
import { clearMemoryRepairStore } from '../src/repositories/repair.repository.js'

process.env.NODE_ENV = 'test'
process.env.CLIENT_URL = 'http://localhost:5173'

const { createApp } = await import('../src/app.js')

describe('Notifications & lifecycle hooks', () => {
  const app = createApp()

  async function createVerifiedUser(
    email: string,
    role: 'customer' | 'vendor',
  ): Promise<string> {
    let capturedOtp = ''
    const spy = jest.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
      const payload = args[1] as { text?: string } | undefined
      if (payload?.text) {
        const match = payload.text.match(/\b\d{6}\b/)
        if (match) capturedOtp = match[0]
      }
    })

    await request(app).post('/api/auth/signup').send({
      fullName: role === 'vendor' ? 'Notify Vendor' : 'Notify Customer',
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

  beforeEach(() => {
    clearMemoryAuthStore()
    clearMemoryRepairStore()
    clearMemoryEstimateStore()
    clearMemoryNotificationStore()
  })

  it('creates customer notification when vendor submits estimate', async () => {
    const customerCookie = await createVerifiedUser('notify-cust@example.com', 'customer')
    const vendorCookie = await createVerifiedUser('notify-vend@example.com', 'vendor')

    const createRes = await request(app)
      .post('/api/repairs')
      .set('Cookie', customerCookie)
      .send({
        deviceType: 'phone',
        brand: 'OnePlus',
        modelName: '12',
        issueCategory: 'battery',
        description: 'Battery drains unusually fast after latest update.',
      })
      .expect(201)

    const repairId = createRes.body.data.repair.id

    await request(app)
      .post(`/api/repairs/${repairId}/estimates`)
      .set('Cookie', vendorCookie)
      .send({
        minCost: 40,
        maxCost: 70,
        turnaroundTime: '1 day',
        warrantyMonths: 3,
        notes: 'Battery replacement recommended.',
      })
      .expect(201)

    const listRes = await request(app)
      .get('/api/notifications')
      .set('Cookie', customerCookie)
      .expect(200)

    expect(listRes.body.data.unreadCount).toBeGreaterThanOrEqual(1)
    expect(listRes.body.data.notifications[0].type).toBe('estimate_received')
    expect(listRes.body.data.notifications[0].repairRequestId).toBe(repairId)
  })

  it('allows marking notifications as read', async () => {
    const customerCookie = await createVerifiedUser('read-cust@example.com', 'customer')
    const vendorCookie = await createVerifiedUser('read-vend@example.com', 'vendor')

    const createRes = await request(app)
      .post('/api/repairs')
      .set('Cookie', customerCookie)
      .send({
        deviceType: 'laptop',
        brand: 'HP',
        modelName: 'Envy',
        issueCategory: 'hardware',
        description: 'Keyboard keys sticking after liquid spill.',
      })
      .expect(201)

    await request(app)
      .post(`/api/repairs/${createRes.body.data.repair.id}/estimates`)
      .set('Cookie', vendorCookie)
      .send({
        minCost: 50,
        maxCost: 90,
        turnaroundTime: '2 days',
        warrantyMonths: 1,
        notes: 'Keyboard assembly swap.',
      })

    const listRes = await request(app)
      .get('/api/notifications')
      .set('Cookie', customerCookie)
      .expect(200)

    const notificationId = listRes.body.data.notifications[0].id

    await request(app)
      .patch(`/api/notifications/${notificationId}/read`)
      .set('Cookie', customerCookie)
      .expect(200)

    const after = await request(app)
      .get('/api/notifications')
      .set('Cookie', customerCookie)
      .expect(200)

    expect(after.body.data.unreadCount).toBe(0)
  })
})
