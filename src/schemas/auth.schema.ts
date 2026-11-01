import { z } from 'zod'

import {
  emailField,
  otpField,
  passwordField,
  personNameField,
} from '../validation/fields.js'

export { passwordField as passwordSchema } from '../validation/fields.js'

export const signupSchema = z
  .object({
    fullName: personNameField,
    email: emailField,
    password: passwordField,
    confirmPassword: z.string(),
    role: z.enum(['customer', 'vendor']),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password.'),
})

export const verifyOtpSchema = z.object({
  email: emailField,
  otp: otpField,
  purpose: z.enum(['signup', 'reset']),
})

export const forgotPasswordSchema = z.object({
  email: emailField,
})

export const resetPasswordSchema = z
  .object({
    email: emailField,
    otp: otpField,
    password: passwordField,
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

export const updateProfileSchema = z.object({
  fullName: personNameField,
})

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>
