import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import type { Database } from "../supabase/database.types";
import type { OrchestratorPlan } from "./orchestrator-schema";

const EXPORT_BUCKET = "report-exports";
const LINK_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days - long enough for a recipient to actually open the email

export class DistributionError extends Error {}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

let resendClient: Resend | null = null;
function getResendClient(): Resend {
  if (!resendClient) resendClient = new Resend(process.env.RESEND_API_KEY);
  return resendClient;
}

type Report = Database["public"]["Tables"]["reports"]["Row"];

/**
 * No real recipient resolution built yet - "email it to management" has
 * no actual address to resolve to, so this falls back to a configured
 * default: the org's own setting (Settings page) if set, else the global
 * DEFAULT_DISTRIBUTION_EMAIL env var. Documented limitation, not a guess:
 * without either configured, distribution can't proceed and the report
 * stays in 'distributing'.
 */
async function resolveRecipients(admin: SupabaseClient<Database>, orgId: number): Promise<string[]> {
  const { data: org } = await admin
    .from("organizations")
    .select("default_distribution_email")
    .eq("id", orgId)
    .maybeSingle();

  const raw = org?.default_distribution_email || process.env.DEFAULT_DISTRIBUTION_EMAIL;
  if (!raw) return [];
  return raw.split(",").map((e) => e.trim()).filter(Boolean);
}

/**
 * Section 16/19: the last step - automatically distribute, then close the
 * workflow. Only called once a report reaches 'distributing' (meaning
 * generation/export already succeeded and the plan asked for distribution).
 */
export async function distributeReport(
  admin: SupabaseClient<Database>,
  report: Report,
  plan: OrchestratorPlan
): Promise<void> {
  if (report.status !== "distributing") return;
  if (plan.distribution.channel !== "email") {
    throw new DistributionError(`Unsupported distribution channel: ${plan.distribution.channel}`);
  }

  const recipients = await resolveRecipients(admin, report.org_id);
  if (recipients.length === 0) {
    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "system",
      action: "distribution.no_recipient_configured",
      entity_type: "report",
      entity_id: report.id,
      details: {},
    });
    throw new DistributionError("No distribution recipient configured - set one in Settings.");
  }

  const { data: exports } = await admin.from("report_exports").select("*").eq("report_id", report.id);
  const links = await Promise.all(
    (exports ?? []).map(async (exp) => {
      if (!exp.storage_path) return null;
      const { data } = await admin.storage.from(EXPORT_BUCKET).createSignedUrl(exp.storage_path, LINK_EXPIRY_SECONDS);
      return data?.signedUrl ? { format: exp.format, url: data.signedUrl } : null;
    })
  );
  const validLinks = links.filter((l): l is { format: string; url: string } => l !== null);

  const title = report.title ?? report.natural_language_request;
  const escapedTitle = escapeHtml(title);
  const linksHtml = validLinks
    .map((l) => `<li><a href="${encodeURI(l.url)}">${escapeHtml(l.format.toUpperCase())}</a></li>`)
    .join("");

  const { data: distributionRow } = await admin
    .from("distributions")
    .insert({
      org_id: report.org_id,
      report_id: report.id,
      channel: "email",
      recipients,
      status: "pending",
    })
    .select("*")
    .single();

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: "DataReportQ <onboarding@resend.dev>",
      to: recipients,
      subject: `Report ready: ${title}`,
      html: `<p>Your report "<strong>${escapedTitle}</strong>" is ready.</p><ul>${linksHtml}</ul><p>Links expire in 7 days.</p>`,
    });

    if (error) throw new DistributionError(error.message);

    if (distributionRow) {
      await admin
        .from("distributions")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", distributionRow.id);
    }

    await admin.from("reports").update({ status: "completed" }).eq("id", report.id);

    await admin.from("audit_log").insert([
      {
        org_id: report.org_id,
        report_id: report.id,
        actor_type: "system",
        action: "distribution.sent",
        entity_type: "report",
        entity_id: report.id,
        details: { recipients, formats: validLinks.map((l) => l.format) },
      },
      {
        org_id: report.org_id,
        report_id: report.id,
        actor_type: "system",
        action: "report.workflow_completed",
        entity_type: "report",
        entity_id: report.id,
        details: {},
      },
    ]);
  } catch (error) {
    if (distributionRow) {
      await admin.from("distributions").update({ status: "failed" }).eq("id", distributionRow.id);
    }
    await admin.from("audit_log").insert({
      org_id: report.org_id,
      report_id: report.id,
      actor_type: "system",
      action: "distribution.failed",
      entity_type: "report",
      entity_id: report.id,
      details: { error: error instanceof Error ? error.message : String(error) },
    });
    throw new DistributionError(error instanceof Error ? error.message : String(error));
  }
}
