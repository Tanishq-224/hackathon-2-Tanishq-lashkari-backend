import { z } from 'zod'

/** @description Password rules aligned with the signup UI copy. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(/\d/, 'Include at least one number.')
  .regex(/[^A-Za-z0-9]/, 'Include at least one special character.')

export const signupSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120),
    password: passwordSchema,
    confirmPassword: z.string(),
    role: z.enum(['customer', 'vendor']),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

export const loginSchema = z.object({
  email: z.string().trim().email().max(120),
  password: z.string().min(1, 'Enter your password.'),
})

export const verifyOtpSchema = z.object({
  email: z.string().trim().email().max(120),
  otp: z.string().trim().length(6, 'Enter the 6-digit code.'),
  purpose: z.enum(['signup', 'reset']),
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(120),
})

export const resetPasswordSchema = z
  .object({
    email: z.string().trim().email().max(120),
    otp: z.string().trim().length(6, 'Enter the 6-digit code.'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

export const googleAuthSchema = z.object({
  credential: z
    .string()
    .trim()
    .min(10, 'Valid Google credential token is required.'),
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>
