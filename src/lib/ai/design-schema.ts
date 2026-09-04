import { z } from "zod";

export const DesignPlanSchema = z.object({
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  layout: z.object({
    sections: z
      .array(
        z.object({
          id: z.string().min(1),
          title: z.string().min(1),
          order: z.number().int(),
        })
      )
      .min(1),
  }),
  components: z
    .array(
      z.object({
        id: z.string().min(1),
        section_id: z.string().min(1),
        type: z.enum(["chart", "table", "kpi", "text"]),
        title: z.string().min(1),
        chart_type: z.enum(["bar", "line", "pie", "none"]),
        data_binding: z.object({
          metric: z.string().min(1),
          dimensions: z.array(z.string()),
        }),
        position: z.object({
          row: z.number().int().min(0),
          col: z.number().int().min(0),
          width: z.number().int().min(1).max(12),
          height: z.number().int().min(1),
        }),
      })
    )
    .min(1),
  style: z.object({
    theme: z.enum(["light", "dark"]),
    primary_color: z.string().min(1),
    font: z.string().min(1),
  }),
});

export type DesignPlan = z.infer<typeof DesignPlanSchema>;

/** Function-call `parameters` schema (OpenAPI-style) mirroring DesignPlanSchema above. */
export const DESIGN_PLAN_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    confidence: {
      type: "number",
      description: "0-100 confidence that this design correctly serves the report request.",
    },
    reasoning: { type: "string", description: "One or two sentences on the design approach." },
    layout: {
      type: "object",
      properties: {
        sections: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Stable snake_case section id, e.g. summary." },
              title: { type: "string" },
              order: { type: "integer" },
            },
            required: ["id", "title", "order"],
          },
        },
      },
      required: ["sections"],
    },
    components: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Stable snake_case component id." },
          section_id: { type: "string", description: "Must match a layout.sections[].id." },
          type: { type: "string", enum: ["chart", "table", "kpi", "text"] },
          title: { type: "string" },
          chart_type: {
            type: "string",
            enum: ["bar", "line", "pie", "none"],
            description: "\"none\" when type is not \"chart\".",
          },
          data_binding: {
            type: "object",
            properties: {
              metric: { type: "string", description: "The measure this component visualizes, e.g. revenue." },
              dimensions: { type: "array", items: { type: "string" } },
            },
            required: ["metric", "dimensions"],
          },
          position: {
            type: "object",
            properties: {
              row: { type: "integer" },
              col: { type: "integer" },
              width: { type: "integer", description: "1-12 grid columns." },
              height: { type: "integer" },
            },
            required: ["row", "col", "width", "height"],
          },
        },
        required: ["id", "section_id", "type", "title", "chart_type", "data_binding", "position"],
      },
    },
    style: {
      type: "object",
      properties: {
        theme: { type: "string", enum: ["light", "dark"] },
        primary_color: { type: "string", description: "Hex color, e.g. #2563eb." },
        font: { type: "string", description: "Font family name, e.g. Inter." },
      },
      required: ["theme", "primary_color", "font"],
    },
  },
  required: ["confidence", "reasoning", "layout", "components", "style"],
};
