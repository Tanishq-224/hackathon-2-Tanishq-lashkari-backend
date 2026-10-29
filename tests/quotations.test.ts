import { jest } from '@jest/globals'
import request from 'supertest'

import { clearMemoryAuthStore } from '../src/repositories/auth.repository.js'
import { clearMemoryEstimateStore } from '../src/repositories/estimate.repository.js'
import { clearMemoryQuotationStore } from '../src/repositories/quotation.repository.js'
import { clearMemoryRepairStore } from '../src/repositories/repair.repository.js'

process.env.NODE_ENV = 'test'
process.env.CLIENT_URL = 'http://localhost:5173'

const { createApp } = await import('../src/app.js')

describe('Phase 5: Physical Diagnosis, Itemized Quotations & Customer Approval', () => {
  const app = createApp()

  let customerCookie: string
  let assignedVendorCookie: string
  let otherVendorCookie: string
  let otherCustomerCookie: string
  let repairId: string

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
    clearMemoryQuotationStore()

    customerCookie = await createVerifiedUser(
      `diag-cust-${Date.now()}@example.com`,
      'Diagnosis Customer',
      'customer',
    )
    assignedVendorCookie = await createVerifiedUser(
      `diag-vend1-${Date.now()}@example.com`,
      'Apex Tech Solutions',
      'vendor',
    )
    otherVendorCookie = await createVerifiedUser(
      `diag-vend2-${Date.now()}@example.com`,
      'Rival Tech Shop',
      'vendor',
    )
    otherCustomerCookie = await createVerifiedUser(
      `diag-cust2-${Date.now()}@example.com`,
      'Other Customer',
      'customer',
    )

    // 1. Customer creates a repair request
    const ticketRes = await request(app)
      .post('/api/repairs')
      .set('Cookie', customerCookie)
      .send({
        deviceType: 'phone',
        brand: 'Apple',
        modelName: 'iPhone 15 Pro',
        issueCategory: 'screen',
        description: 'Shattered front glass and flickering OLED display after drop.',
        urgency: 'high',
      })
      .expect(201)

    repairId = ticketRes.body.data.repair.id

    // 2. Assigned vendor submits estimate
    const estimateRes = await request(app)
      .post(`/api/repairs/${repairId}/estimates`)
      .set('Cookie', assignedVendorCookie)
      .send({
        minCost: 150,
        maxCost: 200,
        turnaroundTime: '24 Hours',
        warrantyMonths: 6,
        notes: 'Initial estimate based on customer photos.',
      })
      .expect(201)

    const estimateId = estimateRes.body.data.estimate.id

    // 3. Customer accepts estimate, advancing ticket to 'vendor_selected'
    await request(app)
      .post(`/api/repairs/${repairId}/select-estimate`)
      .set('Cookie', customerCookie)
      .send({ estimateId })
      .expect(200)
  })

  it('prevents non-assigned vendor from submitting diagnostic quotation', async () => {
    const res = await request(app)
      .post(`/api/repairs/${repairId}/diagnosis`)
      .set('Cookie', otherVendorCookie)
      .send({
        diagnosticFindings: 'Internal diagnostic shows broken ribbon cable.',
        lineItems: [{ description: 'Ribbon Cable', category: 'parts', cost: 45 }],
        estimatedCompletion: 'Tomorrow 5 PM',
      })
      .expect(403)

    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/only the assigned vendor/i)
  })

  it('rejects diagnosis with empty line items or short findings', async () => {
    await request(app)
      .post(`/api/repairs/${repairId}/diagnosis`)
      .set('Cookie', assignedVendorCookie)
      .send({
        diagnosticFindings: 'Short',
        lineItems: [],
        estimatedCompletion: 'Soon',
      })
      .expect(400)
  })

  it('assigned vendor successfully submits diagnosis and itemized quotation', async () => {
    const res = await request(app)
      .post(`/api/repairs/${repairId}/diagnosis`)
      .set('Cookie', assignedVendorCookie)
      .send({
        diagnosticFindings:
          'Device physically inspected. OLED panel shattered, digitizer unresponsive. Battery health at 92%. Frame intact.',
        lineItems: [
          { description: 'OEM Super Retina XDR OLED Display', category: 'parts', cost: 140 },
          { description: 'Screen Adhesive & Water-resistance Seal', category: 'consumable', cost: 15 },
          { description: 'Precision Disassembly & Micro-soldering Labor', category: 'labor', cost: 40 },
        ],
        estimatedCompletion: '24 Hours after approval',
      })
      .expect(201)

    expect(res.body.success).toBe(true)
    expect(res.body.data.quotation.totalAmount).toBe(195)
    expect(res.body.data.quotation.lineItems).toHaveLength(3)
    expect(res.body.data.quotation.status).toBe('pending')
    expect(res.body.data.repair.status).toBe('diagnosed')
  })

  it('allows customer to view the submitted itemized quotation', async () => {
    const res = await request(app)
      .get(`/api/repairs/${repairId}/quotation`)
      .set('Cookie', customerCookie)
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.quotation).toBeDefined()
    expect(res.body.data.quotation.totalAmount).toBe(195)
    expect(res.body.data.quotation.vendorName).toBe('Apex Tech Solutions')
  })

  it('forbids other customers from viewing another user quotation', async () => {
    const res = await request(app)
      .get(`/api/repairs/${repairId}/quotation`)
      .set('Cookie', otherCustomerCookie)
      .expect(403)

    expect(res.body.success).toBe(false)
  })

  it('customer approves quotation, advancing status to quote_approved and recording finalApprovedAmount', async () => {
    const res = await request(app)
      .post(`/api/repairs/${repairId}/quotation/decision`)
      .set('Cookie', customerCookie)
      .send({
        decision: 'approved',
        feedback: 'Approved, please proceed with OEM parts.',
      })
      .expect(200)

    expect(res.body.success).toBe(true)
    expect(res.body.data.quotation.status).toBe('approved')
    expect(res.body.data.repair.status).toBe('quote_approved')
    expect(res.body.data.repair.finalApprovedAmount).toBe(195)
  })

  it('rejects subsequent decision attempts on an already-approved quotation', async () => {
    const res = await request(app)
      .post(`/api/repairs/${repairId}/quotation/decision`)
      .set('Cookie', customerCookie)
      .send({
        decision: 'rejected',
      })
      .expect(400)

    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/already been approved/i)
  })

  it('customer rejection properly cancels ticket lifecycle', async () => {
    // Create another ticket and advance to diagnosis
    const ticketRes = await request(app)
      .post('/api/repairs')
      .set('Cookie', customerCookie)
      .send({
        deviceType: 'laptop',
        brand: 'Dell',
        modelName: 'XPS 15',
        issueCategory: 'hardware',
        description: 'No power, possible blown MOSFET near charging IC.',
        urgency: 'medium',
      })
      .expect(201)

    const secondRepairId = ticketRes.body.data.repair.id

    const estRes = await request(app)
      .post(`/api/repairs/${secondRepairId}/estimates`)
      .set('Cookie', assignedVendorCookie)
      .send({
        minCost: 100,
        maxCost: 250,
        turnaroundTime: '3 Days',
        warrantyMonths: 3,
        notes: 'Motherboard diagnosis needed.',
      })
      .expect(201)

    await request(app)
      .post(`/api/repairs/${secondRepairId}/select-estimate`)
      .set('Cookie', customerCookie)
      .send({ estimateId: estRes.body.data.estimate.id })
      .expect(200)

    await request(app)
      .post(`/api/repairs/${secondRepairId}/diagnosis`)
      .set('Cookie', assignedVendorCookie)
      .send({
        diagnosticFindings: 'Severe liquid corrosion observed under microscope. Multiple layers damaged.',
        lineItems: [
          { description: 'Complete Motherboard Replacement', category: 'parts', cost: 420 },
          { description: 'Ultrasonic Cleaning & Diagnostics', category: 'labor', cost: 80 },
        ],
        estimatedCompletion: '5 Days',
      })
      .expect(201)

    // Customer declines the high quotation
    const declineRes = await request(app)
      .post(`/api/repairs/${secondRepairId}/quotation/decision`)
      .set('Cookie', customerCookie)
      .send({
        decision: 'rejected',
        feedback: 'Cost is too high compared to value of laptop.',
      })
      .expect(200)

    expect(declineRes.body.success).toBe(true)
    expect(declineRes.body.data.quotation.status).toBe('rejected')
    expect(declineRes.body.data.repair.status).toBe('cancelled')
  })
})
