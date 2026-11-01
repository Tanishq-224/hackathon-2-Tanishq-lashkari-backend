import {
  emailField,
  otpField,
  personNameField,
} from '../src/validation/fields.js'

describe('shared field validators', () => {
  it('accepts unicode person names', () => {
    expect(personNameField.safeParse('Tanishq Lashkari').success).toBe(true)
    expect(personNameField.safeParse('María-José O\'Neill').success).toBe(true)
  })

  it('rejects names with digits', () => {
    expect(personNameField.safeParse('John2').success).toBe(false)
  })

  it('normalizes email to lowercase', () => {
    const parsed = emailField.safeParse('User@Example.COM')
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toBe('user@example.com')
    }
  })

  it('requires six digit OTP strings', () => {
    expect(otpField.safeParse('012345').success).toBe(true)
    expect(otpField.safeParse('12345').success).toBe(false)
    expect(otpField.safeParse('12ab45').success).toBe(false)
  })
})
