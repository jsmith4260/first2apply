import { beforeEach, describe, expect, it, jest } from '@jest/globals';

describe('ENV schema', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
  });

  it('parses valid env', async () => {
    process.env.NODE_ENV = 'test';
    process.env.APP_BUNDLE_ID = 'com.example.app';
    process.env.SUPABASE_URL = 'https://xyzcompany.supabase.co';
    process.env.SUPABASE_KEY = 'anon-or-service-key';
    const { ENV } = await import('./env');
    expect(ENV.nodeEnv).toBe('test');
    expect(ENV.supabase.url).toMatch(/^https:\/{2}.*supabase/);
  });

  it('fails fast on invalid URL', async () => {
    process.env.APP_BUNDLE_ID = 'com.example.app';
    process.env.SUPABASE_URL = 'not-a-url';
    process.env.SUPABASE_KEY = 'k';
    await expect(import('./env')).rejects.toThrow(/Invalid environment configuration/);
  });
});
