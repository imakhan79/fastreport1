import { z } from "zod";

/**
 * Structured plan the AI Orchestrator must produce for every report
 * request. This is the contract between "understood the request" and
 * "safe to execute" — nothing downstream (design/query/attachment
 * pipelines) runs on a plan that fails this validation.
 */
export const OrchestratorPlanSchema = z.object({
  title: z.string().min(1),
  report_type: z.string().min(1),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  design: z.object({
    required: z.boolean(),
    mode: z.enum(["automatic", "manual"]),
  }),
  query: z.object({
    required: z.boolean(),
    mode: z.enum(["automatic", "manual"]),
  }),
  attachments: z.object({
    required: z.boolean(),
    requirements: z.array(z.string()),
  }),
  approval: z.object({
    required: z.boolean(),
  }),
  distribution: z.object({
    required: z.boolean(),
    channel: z
      .enum(["email", "slack", "download", "none"])
      .transform((v) => (v === "none" ? null : v)),
  }),
});

export type OrchestratorPlan = z.infer<typeof OrchestratorPlanSchema>;

/** Function-call `parameters` schema (OpenAPI-style) mirroring OrchestratorPlanSchema above. */
export const ORCHESTRATOR_PLAN_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string", description: "Short human-readable report title." },
    report_type: {
      type: "string",
      description: "A stable snake_case key for this kind of report, e.g. monthly_sales_comparison.",
    },
    confidence: {
      type: "number",
      description: "0-100 confidence that this plan correctly captures the request.",
    },
    reasoning: {
      type: "string",
      description: "One or two sentences on how the request was interpreted.",
    },
    design: {
      type: "object",
      properties: {
        required: { type: "boolean" },
        mode: { type: "string", enum: ["automatic", "manual"] },
      },
      required: ["required", "mode"],
    },
    query: {
      type: "object",
      properties: {
        required: { type: "boolean" },
        mode: { type: "string", enum: ["automatic", "manual"] },
      },
      required: ["required", "mode"],
    },
    attachments: {
      type: "object",
      properties: {
        required: { type: "boolean" },
        requirements: {
          type: "array",
          items: { type: "string" },
          description: "Requirement keys for supporting documents this report needs, e.g. approved_sales_summary.",
        },
      },
      required: ["required", "requirements"],
    },
    approval: {
      type: "object",
      properties: {
        required: { type: "boolean" },
      },
      required: ["required"],
    },
    distribution: {
      type: "object",
      properties: {
        required: { type: "boolean" },
        channel: {
          type: "string",
          enum: ["email", "slack", "download", "none"],
          description: "\"none\" when distribution.required is false.",
        },
      },
      required: ["required", "channel"],
    },
  },
  required: [
    "title",
    "report_type",
    "confidence",
    "reasoning",
    "design",
    "query",
    "attachments",
    "approval",
    "distribution",
  ],
};
