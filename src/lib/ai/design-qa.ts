import type { DesignPlan } from "./design-schema";

/**
 * Structural QA for a generated design - catches the failure modes the
 * spec calls out (overflow, empty chart, missing field, broken layout,
 * invalid component) before a design is trusted enough to auto-approve.
 * Deterministic and cheap, so it runs on every design and every re-check
 * after an automatic fix attempt.
 */
export function runDesignQa(design: DesignPlan): string[] {
  const issues: string[] = [];
  const sectionIds = new Set(design.layout.sections.map((s) => s.id));
  const componentIds = new Set<string>();

  if (design.components.length === 0) {
    issues.push("Layout has no components (empty report).");
  }

  for (const component of design.components) {
    if (componentIds.has(component.id)) {
      issues.push(`Duplicate component id "${component.id}" (broken layout).`);
    }
    componentIds.add(component.id);

    if (!sectionIds.has(component.section_id)) {
      issues.push(
        `Component "${component.id}" references unknown section "${component.section_id}" (broken layout).`
      );
    }

    if (component.type === "chart" && component.chart_type === "none") {
      issues.push(`Chart component "${component.id}" has no chart_type set (empty chart).`);
    }

    if (component.type !== "chart" && component.chart_type !== "none") {
      issues.push(
        `Non-chart component "${component.id}" (${component.type}) has a chart_type set (invalid component).`
      );
    }

    if (!component.data_binding.metric.trim()) {
      issues.push(`Component "${component.id}" has an empty data_binding.metric (missing field).`);
    }

    if (component.position.col + component.position.width > 12) {
      issues.push(
        `Component "${component.id}" overflows the 12-column grid (col ${component.position.col} + width ${component.position.width}).`
      );
    }
  }

  const usedSectionIds = new Set(design.components.map((c) => c.section_id));
  for (const section of design.layout.sections) {
    if (!usedSectionIds.has(section.id)) {
      issues.push(`Section "${section.id}" has no components (empty section).`);
    }
  }

  return issues;
}
