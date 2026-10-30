import { z } from 'zod'

const estimateComponentLineSchema = z.object({
  component: z
    .string()
    .trim()
    .min(2, 'Component name must be at least 2 characters')
    .max(120),
  price: z.coerce.number().positive('Each component price must be greater than zero'),
  warrantyMonths: z.coerce
    .number()
    .int()
    .min(0, 'Warranty cannot be negative')
    .max(60, 'Warranty cannot exceed 60 months'),
})

const legacyEstimateFields = z.object({
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

const dynamicEstimateFields = z.object({
  componentLines: z
    .array(estimateComponentLineSchema)
    .min(1, 'Add at least one possible damage component'),
  labourCost: z.coerce.number().min(0, 'Labour cost cannot be negative'),
  turnaroundTime: z
    .string()
    .trim()
    .min(2, 'Turnaround time must be at least 2 characters')
    .max(100),
  notes: z
    .string()
    .trim()
    .min(5, 'Description must be at least 5 characters')
    .max(2000, 'Description cannot exceed 2000 characters'),
})

export const createEstimateSchema = z
  .union([
    legacyEstimateFields.refine((data) => data.maxCost >= data.minCost, {
      message: 'Maximum estimated cost must be greater than or equal to minimum cost',
      path: ['maxCost'],
    }),
    dynamicEstimateFields,
  ])
  .transform((data) => {
    if ('componentLines' in data) {
      const partsTotal = data.componentLines.reduce((sum, line) => sum + line.price, 0)
      const total = partsTotal + data.labourCost
      const warrantyMonths = Math.max(
        ...data.componentLines.map((line) => line.warrantyMonths),
        0,
      )
      return {
        minCost: total,
        maxCost: total,
        turnaroundTime: data.turnaroundTime,
        warrantyMonths,
        notes: data.notes,
        componentLines: data.componentLines,
        labourCost: data.labourCost,
      }
    }

    return {
      minCost: data.minCost,
      maxCost: data.maxCost,
      turnaroundTime: data.turnaroundTime,
      warrantyMonths: data.warrantyMonths,
      notes: data.notes,
    }
  })

export type CreateEstimateInput = z.infer<typeof createEstimateSchema>

export const selectEstimateSchema = z.object({
  estimateId: z.string().trim().min(1, 'Estimate ID is required'),
})

export type SelectEstimateInput = z.infer<typeof selectEstimateSchema>

export const rejectEstimateSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500, 'Reason cannot exceed 500 characters')
    .optional(),
})

export type RejectEstimateInput = z.infer<typeof rejectEstimateSchema>

export const updateEstimateSchema = createEstimateSchema

export type UpdateEstimateInput = z.infer<typeof updateEstimateSchema>
