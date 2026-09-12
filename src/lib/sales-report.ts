import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";

export type SalesReportRow = {
  sales_year: number;
  quarter: string;
  category_name: string;
  total_orders: number;
  total_units_sold: number;
  net_sales_revenue: number;
};

export const SALES_REPORT_COLUMNS = [
  "Sales Year",
  "Quarter",
  "Category Name",
  "Total Orders",
  "Total Units Sold",
  "Net Sales Revenue",
] as const;

export async function fetchSalesReportRows(
  admin: SupabaseClient<Database>,
  orgId: number,
  from: string | null,
  to: string | null
): Promise<SalesReportRow[]> {
  const { data, error } = await admin.rpc("sales_report_quarterly", {
    p_org_id: orgId,
    p_from: from,
    p_to: to,
  });

  if (error) throw error;
  return (data ?? []) as SalesReportRow[];
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function rowsToCsv(rows: SalesReportRow[]): string {
  const escape = (value: string | number) => {
    const str = String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [SALES_REPORT_COLUMNS.map(escape).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.sales_year,
        row.quarter,
        row.category_name,
        row.total_orders,
        row.total_units_sold,
        row.net_sales_revenue.toFixed(2),
      ]
        .map(escape)
        .join(",")
    );
  }
  return lines.join("\r\n");
}
