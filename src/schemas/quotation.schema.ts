import { z } from 'zod'
import { LINE_ITEM_CATEGORIES } from '../models/Quotation.model.js'
import {
  longTextField,
  nonNegativeMoneyField,
  optionalFeedbackField,
  shortLabelField,
} from '../validation/fields.js'

export const lineItemInputSchema = z.object({
  description: z.string().trim().min(2, 'Description must be at least 2 characters').max(200),
  category: z.enum(LINE_ITEM_CATEGORIES).default('parts'),
  cost: nonNegativeMoneyField,
})

export const createQuotationSchema = z.object({
  diagnosticFindings: longTextField(10, 3000, 'Diagnostic findings'),
  lineItems: z
    .array(lineItemInputSchema)
    .min(1, 'Must include at least one itemized line item'),
  estimatedCompletion: shortLabelField(100),
})

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>

export const quotationDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected'], {
    message: 'Decision must be either "approved" or "rejected"',
  }),
  feedback: optionalFeedbackField,
})

export type QuotationDecisionInput = z.infer<typeof quotationDecisionSchema>
