import { GoogleGenAI } from "@google/genai";

let primaryClient: GoogleGenAI | null = null;
let backupClient: GoogleGenAI | null = null;

/** Lazily constructed so builds without GEMINI_API_KEY don't crash at import time. */
export function getGeminiClient(): GoogleGenAI {
  if (!primaryClient) {
    primaryClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return primaryClient;
}

/** Fallback key used when the primary hits a rate limit. Null if none configured. */
export function getBackupGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY_BACKUP) return null;
  if (!backupClient) {
    backupClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY_BACKUP });
  }
  return backupClient;
}

export const ORCHESTRATOR_MODEL = "gemini-3.6-flash";
