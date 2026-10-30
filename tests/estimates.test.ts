import { jest } from '@jest/globals'
import request from 'supertest'

import { clearMemoryAuthStore } from '../src/repositories/auth.repository.js'
import { clearMemoryEstimateStore } from '../src/repositories/estimate.repository.js'
import { clearMemoryRepairStore } from '../src/repositories/repair.repository.js'

process.env.NODE_ENV = 'test'
process.env.CLIENT_URL = 'http://localhost:5173'

const { createApp } = await import('../src/app.js')

describe('Phase 4: Vendor Marketplace & Estimates API', () => {
  const app = createApp()

  let customerCookie: string
  let vendorCookie: string
  let secondVendorCookie: string
  let otherCustomerCookie: string

  let repairId: string
  let estimateId: string

  async function createVerifiedUser(
    email: string,
    fullName: string,
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
      fullName,
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

  beforeAll(async () => {
    clearMemoryAuthStore()
    clearMemoryRepairStore()
    clearMemoryEstimateStore()

    customerCookie = await createVerifiedUser(
      `cust-${Date.now()}@example.com`,
      'Customer One',
      'customer',
    )
    vendorCookie = await createVerifiedUser(
      `vend-${Date.now()}@example.com`,
      'iFix Master Tech',
      'vendor',
    )
    secondVendorCookie = await createVerifiedUser(
      `vend2-${Date.now()}@example.com`,
      'QuickFix Electronics',
      'vendor',
    )
    otherCustomerCookie = await createVerifiedUser(
      `other-${Date.now()}@example.com`,
      'Other Customer',
      'customer',
    )

    // Customer creates a repair request
    const createRes = await request(app)
      .post('/api/repairs')
      .set('Cookie', customerCookie)
      .send({
        deviceType: 'phone',
        brand: 'Apple',
        modelName: 'iPhone 13 Pro',
        issueCategory: 'screen',
        description: 'Front glass shattered and touchscreen has dead zones.',
        urgency: 'high',
        images: [],
      })
      .expect(201)

    repairId = createRes.body.data.repair.id
  })

  it('allows vendors to browse open repair requests in marketplace feed but forbids customers', async () => {
    // Customer access rejected
    await request(app)
      .get('/api/marketplace/repairs')
      .set('Cookie', customerCookie)
      .expect(403)

    // Vendor access allowed
    const res = await request(app)
      .get('/api/marketplace/repairs')
      .set('Cookie', vendorCookie)
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data.requests)).toBe(true)
    expect(res.body.data.requests.some((r: { id: string }) => r.id === repairId)).toBe(true)
  })

  it('allows verified vendors to submit estimates and advances ticket status to estimated', async () => {
    // Customer cannot submit estimate
    await request(app)
      .post(`/api/repairs/${repairId}/estimates`)
      .set('Cookie', customerCookie)
      .send({
        minCost: 120,
        maxCost: 150,
        turnaroundTime: '24 Hours',
        warrantyMonths: 6,
        notes: 'OEM OLED screen replacement with free tempered glass installed.',
      })
      .expect(403)

    // Vendor submits valid estimate
    const res = await request(app)
      .post(`/api/repairs/${repairId}/estimates`)
      .set('Cookie', vendorCookie)
      .send({
        minCost: 120,
        maxCost: 150,
        turnaroundTime: '24 Hours',
        warrantyMonths: 6,
        notes: 'OEM OLED screen replacement with free tempered glass installed.',
      })
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.estimate.vendorName).toBe('iFix Master Tech')
    expect(res.body.data.estimate.status).toBe('pending')
    estimateId = res.body.data.estimate.id

    // Check repair status is now 'estimated'
    const detailRes = await request(app)
      .get(`/api/repairs/${repairId}`)
      .set('Cookie', customerCookie)
      .expect(200)

    expect(detailRes.body.data.repair.status).toBe('estimated')

    // Same vendor cannot submit duplicate estimate
    await request(app)
      .post(`/api/repairs/${repairId}/estimates`)
      .set('Cookie', vendorCookie)
      .send({
        minCost: 110,
        maxCost: 140,
        turnaroundTime: '12 Hours',
        warrantyMonths: 3,
        notes: 'Updated proposal.',
      })
      .expect(409)

    // Second vendor submits an estimate
    await request(app)
      .post(`/api/repairs/${repairId}/estimates`)
      .set('Cookie', secondVendorCookie)
      .send({
        minCost: 130,
        maxCost: 160,
        turnaroundTime: '2 Days',
        warrantyMonths: 12,
        notes: 'Premium refurbishment with 1 year warranty.',
      })
      .expect(201)
  })

  it('allows ticket owner customer to view all estimates but blocks other customers', async () => {
    // Other customer blocked
    await request(app)
      .get(`/api/repairs/${repairId}/estimates`)
      .set('Cookie', otherCustomerCookie)
      .expect(403)

    // Ticket owner retrieves estimates
    const res = await request(app)
      .get(`/api/repairs/${repairId}/estimates`)
      .set('Cookie', customerCookie)
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.estimates.length).toBe(2)
  })

  it('allows ticket owner to select an estimate, assigning vendor and transitioning status to vendor_selected', async () => {
    // Other customer cannot select estimate
    await request(app)
      .post(`/api/repairs/${repairId}/select-estimate`)
      .set('Cookie', otherCustomerCookie)
      .send({ estimateId })
      .expect(403)

    // Owner selects estimate
    const res = await request(app)
      .post(`/api/repairs/${repairId}/select-estimate`)
      .set('Cookie', customerCookie)
      .send({ estimateId })
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.repair.status).toBe('vendor_selected')
    expect(res.body.data.repair.assignedVendorName).toBe('iFix Master Tech')
    expect(res.body.data.acceptedEstimate.status).toBe('accepted')

    // Cannot select again when already assigned
    await request(app)
      .post(`/api/repairs/${repairId}/select-estimate`)
      .set('Cookie', customerCookie)
      .send({ estimateId })
      .expect(400)
  })

  it('allows customer to reject and vendor to withdraw pending estimates on a fresh ticket', async () => {
    const createRes = await request(app)
      .post('/api/repairs')
      .set('Cookie', customerCookie)
      .send({
        deviceType: 'laptop',
        brand: 'Dell',
        modelName: 'XPS 15',
        issueCategory: 'battery',
        description: 'Battery not holding charge.',
        urgency: 'medium',
        images: [],
      })
      .expect(201)

    const freshRepairId = createRes.body.data.repair.id

    const vendorEstimateRes = await request(app)
      .post(`/api/repairs/${freshRepairId}/estimates`)
      .set('Cookie', vendorCookie)
      .send({
        minCost: 90,
        maxCost: 120,
        turnaroundTime: '48 Hours',
        warrantyMonths: 6,
        notes: 'OEM battery replacement.',
      })
      .expect(201)

    const freshEstimateId = vendorEstimateRes.body.data.estimate.id

    const rejectRes = await request(app)
      .post(`/api/repairs/${freshRepairId}/estimates/${freshEstimateId}/reject`)
      .set('Cookie', customerCookie)
      .send({ reason: 'Too expensive' })
      .expect(200)

    expect(rejectRes.body.data.estimate.status).toBe('declined')

    await request(app)
      .post(`/api/repairs/${freshRepairId}/estimates`)
      .set('Cookie', secondVendorCookie)
      .send({
        minCost: 80,
        maxCost: 95,
        turnaroundTime: '24 Hours',
        warrantyMonths: 3,
        notes: 'Aftermarket battery option.',
      })
      .expect(201)

    const listRes = await request(app)
      .get(`/api/repairs/${freshRepairId}/estimates`)
      .set('Cookie', secondVendorCookie)
      .expect(200)

    const secondBid = listRes.body.data.estimates[0]

    const withdrawRes = await request(app)
      .post(`/api/repairs/${freshRepairId}/estimates/${secondBid.id}/withdraw`)
      .set('Cookie', secondVendorCookie)
      .expect(200)

    expect(withdrawRes.body.data.estimate.status).toBe('withdrawn')
  })
})
