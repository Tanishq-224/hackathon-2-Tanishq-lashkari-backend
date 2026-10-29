import { v2 as cloudinary } from 'cloudinary'

import { env } from '../config/env.js'

let isConfigured = false

if (
  env.CLOUDINARY_CLOUD_NAME &&
  env.CLOUDINARY_API_KEY &&
  env.CLOUDINARY_API_SECRET
) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  })
  isConfigured = true
}

export type UploadedImageResult = {
  url: string
  publicId: string
}

/**
 * @description Builds a local fallback result when Cloudinary is unavailable.
 * @param {string} dataUri - Original base64 data URI from the client.
 * @returns {UploadedImageResult} Fallback attachment metadata.
 */
function localImageFallback(dataUri: string): UploadedImageResult {
  const fallbackId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  return {
    url: dataUri.startsWith('data:')
      ? dataUri
      : `https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=800&q=80`,
    publicId: fallbackId,
  }
}

/**
 * @description Normalizes Cloudinary SDK errors into a readable string.
 * @param {unknown} error - Thrown value from the SDK.
 * @returns {string} Human-readable message.
 */
function formatCloudinaryError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message: unknown }).message
    if (typeof msg === 'string' && msg.length > 0) {
      return msg
    }
  }
  return error instanceof Error ? error.message : String(error)
}

/**
 * @description Uploads an image (base64 Data URI) to Cloudinary or returns fallback for dev/testing.
 * @async
 * @param {string} dataUri - Base64 encoded image string (data:image/...;base64,...).
 * @returns {Promise<UploadedImageResult>} Upload result with secure URL and public ID.
 */
export async function uploadRepairImage(
  dataUri: string,
): Promise<UploadedImageResult> {
  if (!isConfigured || env.NODE_ENV === 'test') {
    return localImageFallback(dataUri)
  }

  try {
    const res = await cloudinary.uploader.upload(dataUri, {
      folder: 'repairex/repairs',
      resource_type: 'image',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto:good' },
      ],
    })

    return {
      url: res.secure_url,
      publicId: res.public_id,
    }
  } catch (error: unknown) {
    const message = formatCloudinaryError(error)
    console.error('[cloudinary:error] Failed to upload image:', message)

    if (env.NODE_ENV === 'development') {
      console.warn(
        `[cloudinary:dev-fallback] Using inline image for local dev. Check CLOUDINARY_CLOUD_NAME / API keys in .env — ${message}`,
      )
      return localImageFallback(dataUri)
    }

    throw new Error(
      message.includes('cloud_name')
        ? `Image upload failed: ${message}. Verify CLOUDINARY_CLOUD_NAME in your server environment.`
        : 'Image upload failed. Please try again.',
    )
  }
}

