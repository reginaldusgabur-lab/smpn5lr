'use client';
import { configureGenkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/google-genai';
import { firebase } from '@genkit-ai/firebase';
import { gemini15Flash } from '@genkit-ai/google-genai';

export const config = configureGenkit({
  plugins: [
    firebase(), // Mengaktifkan logging dan tracing ke Firebase
    googleAI(), // Mengaktifkan koneksi ke Google AI (Gemini)
  ],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});

export const model = gemini15Flash;
