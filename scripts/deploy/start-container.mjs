import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { runtimeConfig } from './public-config.mjs';
import { verifyOcr } from './verify-ocr.mjs';

try {
  Object.assign(process.env, runtimeConfig(process.env));
  verifyOcr();
  // Import the unchanged standalone server in PID 1; Next retains its SIGTERM handling.
  await import(pathToFileURL(path.resolve('server.js')).href);
} catch (error) {
  console.error(`Container startup failed: ${error.message}`);
  process.exitCode = 1;
}
