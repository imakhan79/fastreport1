import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

/** Lazily constructed so builds without GEMINI_API_KEY don't crash at import time. */
export function getGeminiClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

export const ORCHESTRATOR_MODEL = "gemini-3.6-flash";
