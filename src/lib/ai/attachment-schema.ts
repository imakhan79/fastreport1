import { z } from "zod";

export const AttachmentClassificationSchema = z.object({
  classification: z.string().min(1),
  satisfies_requirement: z.boolean(),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
});

export type AttachmentClassification = z.infer<typeof AttachmentClassificationSchema>;

/** Function-call `parameters` schema (OpenAPI-style) mirroring AttachmentClassificationSchema above. */
export const ATTACHMENT_CLASSIFICATION_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    classification: {
      type: "string",
      description: "Short snake_case label for what this document actually is, e.g. sales_summary, invoice, receipt.",
    },
    satisfies_requirement: {
      type: "boolean",
      description: "Whether this document satisfies the stated requirement.",
    },
    confidence: {
      type: "number",
      description: "0-100 confidence in this classification and satisfies_requirement judgment.",
    },
    reasoning: { type: "string", description: "One or two sentences explaining the judgment." },
  },
  required: ["classification", "satisfies_requirement", "confidence", "reasoning"],
};
