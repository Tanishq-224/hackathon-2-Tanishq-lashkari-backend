import { jest } from '@jest/globals'
import request from 'supertest'

import { clearMemoryAuthStore } from '../src/repositories/auth.repository.js'
import { clearMemoryEstimateStore } from '../src/repositories/estimate.repository.js'
import { clearMemoryQuotationStore } from '../src/repositories/quotation.repository.js'
import { clearMemoryRepairStore } from '../src/repositories/repair.repository.js'

process.env.NODE_ENV = 'test'
process.env.CLIENT_URL = 'http://localhost:5173'

const { createApp } = await import('../src/app.js')

describe('Phase 6: In-Repair Workflow & Completion Proof', () => {
  const app = createApp()

  let customerCookie: string
  let vendorCookie: string
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
      `phase6-cust-${Date.now()}@example.com`,
      'Phase Six Customer',
      'customer',
    )
    vendorCookie = await createVerifiedUser(
      `phase6-vend-${Date.now()}@example.com`,
      'Bench Master Tech',
      'vendor',
    )

    const ticketRes = await request(app)
      .post('/api/repairs')
      .set('Cookie', customerCookie)
      .send({
        deviceType: 'phone',
        brand: 'Google',
        modelName: 'Pixel 8',
        issueCategory: 'screen',
        description: 'Cracked display and touch ghosting near the bezel.',
        images: [{ url: 'https://example.com/before.jpg', publicId: 'before_1' }],
      })
      .expect(201)

    repairId = ticketRes.body.data.repair.id

    const estimateRes = await request(app)
      .post(`/api/repairs/${repairId}/estimates`)
      .set('Cookie', vendorCookie)
      .send({
        minCost: 90,
        maxCost: 130,
        turnaroundTime: '1 day',
        warrantyMonths: 3,
        notes: 'OLED swap estimate.',
      })
      .expect(201)

    await request(app)
      .post(`/api/repairs/${repairId}/select-estimate`)
      .set('Cookie', customerCookie)
      .send({ estimateId: estimateRes.body.data.estimate.id })
      .expect(200)

    await request(app)
      .post(`/api/repairs/${repairId}/diagnosis`)
      .set('Cookie', vendorCookie)
      .send({
        diagnosticFindings: 'Confirmed OLED delamination and digitizer failure under bench microscope.',
        lineItems: [
          { description: 'Pixel OLED Assembly', category: 'parts', cost: 110 },
          { description: 'Bench labor', category: 'labor', cost: 35 },
        ],
        estimatedCompletion: 'Same day',
      })
      .expect(201)

    await request(app)
      .post(`/api/repairs/${repairId}/quotation/decision`)
      .set('Cookie', customerCookie)
      .send({ decision: 'approved' })
      .expect(200)
  })

  it('vendor starts repair work after quote approval', async () => {
    const res = await request(app)
      .post(`/api/repairs/${repairId}/repair-work/start`)
      .set('Cookie', vendorCookie)
      .send({
        repairBenchNotes: 'Parts staged. Beginning OLED removal and adhesive cure cycle.',
      })
      .expect(200)

    expect(res.body.data.repair.status).toBe('in_repair')
    expect(res.body.data.repair.repairBenchNotes).toMatch(/Parts staged/)
  })

  it('rejects completion proof before in_repair status', async () => {
    const otherTicket = await request(app)
      .post('/api/repairs')
      .set('Cookie', customerCookie)
      .send({
        deviceType: 'tablet',
        brand: 'Apple',
        modelName: 'iPad Air',
        issueCategory: 'battery',
        description: 'Battery swelling detected during inspection.',
      })
      .expect(201)

    const otherId = otherTicket.body.data.repair.id

    const res = await request(app)
      .post(`/api/repairs/${otherId}/repair-work/completion`)
      .set('Cookie', vendorCookie)
      .send({
        afterRepairImages: [{ url: 'https://example.com/after.jpg' }],
        resolutionSummary: 'Device tested and screen calibrated successfully.',
      })
      .expect(403)

    expect(res.body.message).toMatch(/assigned vendor/i)
  })

  it('vendor submits after-repair proof and marks ready for pickup', async () => {
    const res = await request(app)
      .post(`/api/repairs/${repairId}/repair-work/completion`)
      .set('Cookie', vendorCookie)
      .send({
        afterRepairImages: [
          { url: 'https://example.com/after-screen.jpg', publicId: 'after_1' },
        ],
        resolutionSummary:
          'New OLED installed, True Tone calibrated, touch and face unlock verified on bench.',
      })
      .expect(200)

    expect(res.body.data.repair.status).toBe('ready_for_pickup')
    expect(res.body.data.repair.afterRepairImages).toHaveLength(1)
    expect(res.body.data.repair.resolutionSummary).toMatch(/OLED installed/)
  })

  it('customer confirms pickup and closes ticket as completed', async () => {
    const res = await request(app)
      .post(`/api/repairs/${repairId}/repair-work/confirm-pickup`)
      .set('Cookie', customerCookie)
      .expect(200)

    expect(res.body.data.repair.status).toBe('completed')

    const detail = await request(app)
      .get(`/api/repairs/${repairId}`)
      .set('Cookie', customerCookie)
      .expect(200)

    expect(detail.body.data.repair.finalApprovedAmount).toBe(145)
    expect(detail.body.data.repair.afterRepairImages).toHaveLength(1)
  })
})
