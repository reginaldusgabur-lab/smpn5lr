import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

// Genkit automatically looks for the GEMINI_API_KEY environment variable.
// This configuration relies on that default behavior.
export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-2.5-flash',
});
