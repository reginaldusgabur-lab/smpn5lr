import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/google-genai';

// The Genkit plugin will automatically look for the GEMINI_API_KEY
// environment variable. We will set this in our Vercel project settings.

export const ai = genkit({
  plugins: [googleAI()], // No need to pass the key here directly
  model: 'googleai/gemini-1.5-flash',
});
