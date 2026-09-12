import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, UnauthorizedError } from "@/lib/auth";
import { fetchSalesReportRows } from "@/lib/sales-report";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  let orgId: number;
  try {
    ({ orgId } = await getAuthContext());
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (fromParam && !DATE_PATTERN.test(fromParam)) {
    return NextResponse.json({ error: "'from' must be a yyyy-mm-dd date." }, { status: 400 });
  }
  if (toParam && !DATE_PATTERN.test(toParam)) {
    return NextResponse.json({ error: "'to' must be a yyyy-mm-dd date." }, { status: 400 });
  }
  if (fromParam && toParam && fromParam > toParam) {
    return NextResponse.json({ error: "'From Date' must be on or before 'To Date'." }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const rows = await fetchSalesReportRows(admin, orgId, fromParam, toParam);
    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ error: "Failed to generate the sales report." }, { status: 500 });
  }
}
