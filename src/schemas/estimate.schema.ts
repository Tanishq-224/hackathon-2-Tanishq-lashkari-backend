import { z } from 'zod'

export const createEstimateSchema = z
  .object({
    minCost: z.coerce.number().positive('Minimum cost must be greater than 0'),
    maxCost: z.coerce.number().positive('Maximum cost must be greater than 0'),
    turnaroundTime: z
      .string()
      .trim()
      .min(2, 'Turnaround time must be at least 2 characters (e.g. "24 Hours", "1-2 Days")')
      .max(100),
    warrantyMonths: z.coerce
      .number()
      .int()
      .min(0, 'Warranty cannot be negative')
      .max(60, 'Warranty cannot exceed 60 months')
      .default(3),
    notes: z
      .string()
      .trim()
      .min(5, 'Notes must be at least 5 characters')
      .max(2000, 'Notes cannot exceed 2000 characters'),
  })
  .refine((data) => data.maxCost >= data.minCost, {
    message: 'Maximum estimated cost must be greater than or equal to minimum cost',
    path: ['maxCost'],
  })

export type CreateEstimateInput = z.infer<typeof createEstimateSchema>

export const selectEstimateSchema = z.object({
  estimateId: z.string().trim().min(1, 'Estimate ID is required'),
})

export type SelectEstimateInput = z.infer<typeof selectEstimateSchema>

