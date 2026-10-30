import {
  buildBrandedEmailHtml,
  buildLifecycleEmailHtml,
  buildOtpEmailHtml,
  escapeHtml,
} from '../src/templates/email.template.js'

describe('email templates', () => {
  it('escapes HTML in user-facing copy', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })

  it('renders branded shell with Repairex header and CTA', () => {
    const html = buildBrandedEmailHtml({
      headline: 'Test headline',
      paragraphs: ['Hello from Repairex.'],
      cta: { label: 'Open dashboard', href: 'https://example.com/dashboard' },
    })

    expect(html).toContain('Repairex')
    expect(html).toContain('Test headline')
    expect(html).toContain('Open dashboard')
    expect(html).toContain('https://example.com/dashboard')
    expect(html).toContain('#e66418')
  })

  it('builds OTP email with code block', () => {
    const html = buildOtpEmailHtml({
      purpose: 'signup',
      code: '123456',
      expiresMinutes: 10,
    })

    expect(html).toContain('123456')
    expect(html).toContain('Verify your email')
    expect(html).toContain('expires in 10 minutes')
  })

  it('builds lifecycle email from repair notifications', () => {
    const html = buildLifecycleEmailHtml({
      headline: 'Diagnostic quotation ready for approval',
      bodyText: 'Your vendor posted a quote. Review it in Repairex.',
      dashboardUrl: 'http://localhost:5173/dashboard/repairs/abc',
    })

    expect(html).toContain('Diagnostic quotation ready for approval')
    expect(html).toContain('Open Repairex dashboard')
    expect(html).toContain('/dashboard/repairs/abc')
  })
})
