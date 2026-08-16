import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, authEnabled } from "@/lib/auth/context";
import { permissionsForRole } from "@/lib/auth/rbac";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ctx = getAuthContext(request);
  if (!ctx) return NextResponse.json({ authenticated: false, authEnabled: authEnabled() });
  return NextResponse.json({
    authenticated: true,
    authEnabled: authEnabled(),
    user: { id: ctx.userId, username: ctx.username, role: ctx.role, tenantId: ctx.tenantId, via: ctx.via },
    permissions: permissionsForRole(ctx.role),
  });
}
