import "server-only";

import { configure } from '@genkit-ai/core';
import { googleAI, gemini15Flash } from '@genkit-ai/google-genai';

configure({
  plugins: [
    googleAI(),
  ],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});

export const model = gemini15Flash;
