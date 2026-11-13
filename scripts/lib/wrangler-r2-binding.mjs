/** R2 bucket binding injected only in deploy-prepared Wrangler config (never in committed wrangler.jsonc). */
export const PHYSIO_R2_BINDING = "PHYSIO_MEDIA";
export const PHYSIO_R2_BUCKET_NAME = "physio-media";

export const PHYSIO_PRODUCTION_R2_BUCKETS = [
  {
    binding: PHYSIO_R2_BINDING,
    bucket_name: PHYSIO_R2_BUCKET_NAME,
  },
];
