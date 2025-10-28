import { z } from 'zod';

const RawEnv = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  APP_BUNDLE_ID: z.string().min(1, 'APP_BUNDLE_ID is required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_KEY: z.string().min(1, 'SUPABASE_KEY is required'),
  MEZMO_API_KEY: z.string().optional(),
  AMPLITUDE_API_KEY: z.string().optional(),
});

const parsed = RawEnv.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.flatten().fieldErrors;
  throw new Error(`Invalid environment configuration: ${JSON.stringify(issues)}`);
}

export const ENV = {
  nodeEnv: parsed.data.NODE_ENV,
  appBundleId: parsed.data.APP_BUNDLE_ID,
  supabase: {
    url: parsed.data.SUPABASE_URL,
    key: parsed.data.SUPABASE_KEY,
  },
  mezmoApiKey: parsed.data.MEZMO_API_KEY,
  amplitudeApiKey: parsed.data.AMPLITUDE_API_KEY,
} as const;
