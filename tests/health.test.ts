import request from 'supertest'

process.env.NODE_ENV = 'test'
process.env.CLIENT_URL = 'http://localhost:5173'

const { createApp } = await import('../src/app.js')

describe('GET /api/health', () => {
  it('returns running status with success envelope', async () => {
    const app = createApp()

    const response = await request(app).get('/api/health').expect(200)

    expect(response.body).toMatchObject({
      success: true,
      message: 'Repairex API is running',
      data: {
        environment: 'test',
        database: {
          mode: expect.stringMatching(/mongodb|in-memory/),
        },
      },
    })
  })
})

describe('Unknown routes', () => {
  it('returns 404 with consistent error envelope', async () => {
    const app = createApp()

    const response = await request(app).get('/api/unknown-route').expect(404)

    expect(response.body).toMatchObject({
      success: false,
      message: expect.stringContaining('Route not found'),
    })
  })
})
