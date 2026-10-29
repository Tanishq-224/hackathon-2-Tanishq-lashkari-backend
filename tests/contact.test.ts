import request from 'supertest'

process.env.NODE_ENV = 'test'
process.env.CLIENT_URL = 'http://localhost:5173'

const { createApp } = await import('../src/app.js')

describe('POST /api/contact', () => {
  it('accepts a valid contact payload', async () => {
    const app = createApp()

    const response = await request(app)
      .post('/api/contact')
      .send({
        fullName: 'Alex Customer',
        email: 'alex@example.com',
        phone: '+91 90000 00000',
        topic: 'repair-request',
        message: 'My laptop battery drains quickly and I need an estimate.',
      })
      .expect(201)

    expect(response.body).toMatchObject({
      success: true,
      message: expect.stringContaining('received'),
      data: { receivedAt: expect.any(String) },
    })
  })

  it('rejects invalid payloads with 400', async () => {
    const app = createApp()

    const response = await request(app)
      .post('/api/contact')
      .send({
        fullName: 'A',
        email: 'not-an-email',
        topic: 'repair-request',
        message: 'short',
      })
      .expect(400)

    expect(response.body).toMatchObject({
      success: false,
      message: expect.stringMatching(/invalid/i),
    })
  })
})
