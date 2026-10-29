import { z } from 'zod'
import { LINE_ITEM_CATEGORIES } from '../models/Quotation.model.js'

export const lineItemInputSchema = z.object({
  description: z.string().trim().min(2, 'Description must be at least 2 characters').max(200),
  category: z.enum(LINE_ITEM_CATEGORIES).default('parts'),
  cost: z.coerce.number().min(0, 'Cost cannot be negative'),
})

export const createQuotationSchema = z.object({
  diagnosticFindings: z
    .string()
    .trim()
    .min(10, 'Diagnostic findings must be at least 10 characters')
    .max(3000),
  lineItems: z
    .array(lineItemInputSchema)
    .min(1, 'Must include at least one itemized line item'),
  estimatedCompletion: z
    .string()
    .trim()
    .min(2, 'Estimated completion must be at least 2 characters')
    .max(100),
})

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>

export const quotationDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected'], {
    message: 'Decision must be either "approved" or "rejected"',
  }),
  feedback: z.string().trim().max(1000).optional(),
})

export type QuotationDecisionInput = z.infer<typeof quotationDecisionSchema>

