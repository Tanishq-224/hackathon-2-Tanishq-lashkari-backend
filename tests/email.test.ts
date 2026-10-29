import {
  getSafeSmtpConfig,
  isCloudBlockedSmtpPort,
  isRunningOnRender,
  isSmtpConfigured,
  maskEmail,
  resolveSmtpSecure,
} from '../src/services/email.service.js'

describe('Email Service Configuration and Security', () => {
  describe('resolveSmtpSecure()', () => {
    it('returns true for port 465 when unconfigured', () => {
      expect(resolveSmtpSecure(465)).toBe(true)
    })

    it('returns false for port 587 when unconfigured', () => {
      expect(resolveSmtpSecure(587)).toBe(false)
    })

    it('returns false for port 2525 when unconfigured', () => {
      expect(resolveSmtpSecure(2525)).toBe(false)
    })

    it('respects explicit configuredSecure flag true on port 587', () => {
      expect(resolveSmtpSecure(587, true)).toBe(true)
    })

    it('respects explicit configuredSecure flag false on port 465', () => {
      expect(resolveSmtpSecure(465, false)).toBe(false)
    })
  })

  describe('maskEmail()', () => {
    it('masks standard email addresses safely', () => {
      expect(maskEmail('lashkaritanishq176@gmail.com')).toBe('la***@gmail.com')
      expect(maskEmail('alex@example.com')).toBe('al***@example.com')
    })

    it('handles short usernames safely', () => {
      expect(maskEmail('a@b.com')).toBe('***@b.com')
      expect(maskEmail('ab@b.com')).toBe('***@b.com')
    })
  })

  describe('Render / cloud SMTP helpers', () => {
    const originalRender = process.env.RENDER

    afterEach(() => {
      if (originalRender === undefined) {
        delete process.env.RENDER
      } else {
        process.env.RENDER = originalRender
      }
    })

    it('detects blocked SMTP ports on PaaS hosts', () => {
      expect(isCloudBlockedSmtpPort(465)).toBe(true)
      expect(isCloudBlockedSmtpPort(587)).toBe(true)
      expect(isCloudBlockedSmtpPort(2525)).toBe(false)
    })

    it('detects Render runtime via RENDER env', () => {
      delete process.env.RENDER
      expect(isRunningOnRender()).toBe(false)
      process.env.RENDER = 'true'
      expect(isRunningOnRender()).toBe(true)
    })
  })

  describe('getSafeSmtpConfig()', () => {
    it('never exposes SMTP_PASS in returned metadata', () => {
      const config = getSafeSmtpConfig()
      expect(config).not.toHaveProperty('pass')
      expect(config).not.toHaveProperty('password')
      expect(config).not.toHaveProperty('SMTP_PASS')
      expect(config).toHaveProperty('configured')
      expect(config).toHaveProperty('provider')
    })
  })
})

