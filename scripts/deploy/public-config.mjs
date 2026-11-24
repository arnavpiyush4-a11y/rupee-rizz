import { publicConfig } from '../../lib/supabase/public-config.js';
export { publicConfig };

export function runtimeConfig(env) {
  if (!env.RR_OCR_SIGNING_KEY || env.RR_OCR_SIGNING_KEY.length < 32)
    throw Error('RR_OCR_SIGNING_KEY is required at runtime and must contain at least 32 random characters. Configure it in the deployment environment, never in the Dockerfile.');
  const port = env.PORT || '80';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw Error('PORT must be an integer from 1 to 65535.');
  publicConfig(env);
  return { ...env, PORT: port, HOSTNAME: '0.0.0.0' };
}
