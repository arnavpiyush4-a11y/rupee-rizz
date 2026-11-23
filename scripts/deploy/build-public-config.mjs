import { writeFile } from 'node:fs/promises';
import { publicConfig } from './public-config.mjs';

try {
  const config = publicConfig(process.env);
  await writeFile('container-public-config.json', JSON.stringify(config) + '\n');
  console.log('Validated public Supabase build configuration. No runtime secrets are needed for the image build.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
