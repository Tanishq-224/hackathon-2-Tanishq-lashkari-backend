import { z } from 'zod'

import {
  emailField,
  longTextField,
  optionalPhoneField,
  personNameField,
} from '../validation/fields.js'

/** @description Allowed contact form topic values. */
export const contactTopics = ['platform', 'vendor', 'other'] as const

/**
 * @description Validates inbound public contact form payloads.
 */
export const contactMessageSchema = z.object({
  fullName: personNameField,
  email: emailField,
  phone: optionalPhoneField,
  topic: z.enum(contactTopics),
  message: longTextField(10, 2000, 'Message'),
})

/** @description Parsed contact message body. */
export type ContactMessageInput = z.infer<typeof contactMessageSchema>
