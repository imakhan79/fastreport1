import type { ZodType } from "zod";
import type { GoogleGenAI } from "@google/genai";
import { getGeminiClient, getBackupGeminiClient, ORCHESTRATOR_MODEL } from "./gemini";

export class AiToolCallError extends Error {}

function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || /quota/i.test(message);
}

async function createInteraction(
  client: GoogleGenAI,
  opts: { systemInstruction: string; input: string; toolName: string; toolDescription: string; toolParameters: object }
) {
  return client.interactions.create({
    model: ORCHESTRATOR_MODEL,
    system_instruction: opts.systemInstruction,
    input: opts.input,
    tools: [
      {
        type: "function",
        name: opts.toolName,
        description: opts.toolDescription,
        parameters: opts.toolParameters,
      },
    ],
    generation_config: { tool_choice: "any" },
  });
}

export async function callGeminiTool<T>(opts: {
  systemInstruction: string;
  input: string;
  toolName: string;
  toolDescription: string;
  toolParameters: object;
  schema: ZodType<T>;
}): Promise<T> {
  let interaction;
  try {
    interaction = await createInteraction(getGeminiClient(), opts);
  } catch (primaryError) {
    const backup = isRateLimitError(primaryError) ? getBackupGeminiClient() : null;
    if (!backup) {
      throw new AiToolCallError(
        `Gemini API error: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}`
      );
    }
    try {
      interaction = await createInteraction(backup, opts);
    } catch (backupError) {
      throw new AiToolCallError(
        `Gemini API error (primary key rate-limited, backup also failed): ${
          backupError instanceof Error ? backupError.message : String(backupError)
        }`
      );
    }
  }

  const functionCallStep = interaction.steps?.find(
    (step: { type: string }) => step.type === "function_call"
  ) as { type: string; name: string; arguments: unknown } | undefined;

  if (!functionCallStep) {
    throw new AiToolCallError(`Model did not call ${opts.toolName} (no function_call step).`);
  }

  const parsed = opts.schema.safeParse(functionCallStep.arguments);
  if (!parsed.success) {
    throw new AiToolCallError(
      `${opts.toolName} arguments failed schema validation: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
