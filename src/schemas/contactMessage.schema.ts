import { z } from 'zod'

/** @description Allowed contact form topic values. */
export const contactTopics = [
  'repair-request',
  'vendor',
  'support',
  'other',
] as const

/**
 * @description Validates inbound public contact form payloads.
 */
export const contactMessageSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  phone: z
    .string()
    .trim()
    .max(24)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  topic: z.enum(contactTopics),
  message: z.string().trim().min(10).max(2000),
})

/** @description Parsed contact message body. */
export type ContactMessageInput = z.infer<typeof contactMessageSchema>
