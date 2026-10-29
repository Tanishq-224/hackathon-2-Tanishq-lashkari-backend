import { getDatabaseDiagnostics } from '../src/config/database.js'

describe('Database Connection Diagnostics & Production Safeguards', () => {
  it('returns safe diagnostics without credentials or connection strings', () => {
    const diag = getDatabaseDiagnostics()

    expect(diag).toHaveProperty('connected')
    expect(diag).toHaveProperty('readyState')
    expect(diag).toHaveProperty('mode')
    expect(['mongodb', 'in-memory']).toContain(diag.mode)

    // Ensure no secrets or credentials leaked
    const jsonStr = JSON.stringify(diag)
    expect(jsonStr).not.toMatch(/mongodb(\+srv)?:\/\//)
    expect(jsonStr).not.toMatch(/password/i)
  })
})

