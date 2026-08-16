import { NextRequest, NextResponse } from "next/server";
import { computeAggregate } from "@/lib/distributed";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const agg = computeAggregate(jobId);
  if (!agg || !agg.parent) {
    return NextResponse.json({ success: false, error: "Verteilter Job nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    parent: agg.parent,
    progress: agg.progress,
    speed: agg.speed,
    shardsDone: agg.done,
    shardsTotal: agg.total,
    shards: agg.shards.map((s) => ({
      id: s.id,
      shardIndex: s.shardIndex,
      status: s.status,
      progress: s.progress,
      speed: s.speed,
      skip: s.skip,
      limit: s.limit,
      devices: s.devices,
      recoveredPassword: s.recoveredPassword,
    })),
  });
}
