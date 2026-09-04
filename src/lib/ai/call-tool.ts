import type { ZodType } from "zod";
import { getGeminiClient, ORCHESTRATOR_MODEL } from "./gemini";

export class AiToolCallError extends Error {}

export async function callGeminiTool<T>(opts: {
  systemInstruction: string;
  input: string;
  toolName: string;
  toolDescription: string;
  toolParameters: object;
  schema: ZodType<T>;
}): Promise<T> {
  const client = getGeminiClient();

  let interaction;
  try {
    interaction = await client.interactions.create({
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
  } catch (error) {
    throw new AiToolCallError(
      `Gemini API error: ${error instanceof Error ? error.message : String(error)}`
    );
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
