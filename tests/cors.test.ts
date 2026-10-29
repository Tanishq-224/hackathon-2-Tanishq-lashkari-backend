import request from 'supertest'

process.env.NODE_ENV = 'test'
process.env.CLIENT_URL = 'https://repairex-client.vercel.app,http://localhost:5173'

const { createApp } = await import('../src/app.js')

describe('Production & Development CORS Configuration', () => {
  const app = createApp()

  it('allows requests from production Vercel frontend with exact matching origin and credentials', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://repairex-client.vercel.app')
      .expect(200)

    expect(res.headers['access-control-allow-origin']).toBe(
      'https://repairex-client.vercel.app',
    )
    expect(res.headers['access-control-allow-credentials']).toBe('true')
    expect(res.headers['access-control-allow-origin']).not.toBe('*')
  })

  it('allows requests from local Vite frontend origin', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173')
      .expect(200)

    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    )
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('correctly handles OPTIONS preflight request from production Vercel frontend', async () => {
    const res = await request(app)
      .options('/api/auth/signup')
      .set('Origin', 'https://repairex-client.vercel.app')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type,Authorization')

    expect([200, 204]).toContain(res.status)
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://repairex-client.vercel.app',
    )
    expect(res.headers['access-control-allow-credentials']).toBe('true')
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/i)
  })

  it('handles OPTIONS preflight for /api/auth/me', async () => {
    const res = await request(app)
      .options('/api/auth/me')
      .set('Origin', 'https://repairex-client.vercel.app')
      .set('Access-Control-Request-Method', 'GET')

    expect([200, 204]).toContain(res.status)
    expect(res.headers['access-control-allow-origin']).toBe(
      'https://repairex-client.vercel.app',
    )
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('blocks or refuses access-control-allow-origin header to unauthorized malicious origins', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'https://malicious-phishing-site.example.com')

    // Origin header must not be reflected
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

