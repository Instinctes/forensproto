 
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    const apiKey = authHeader ? authHeader.replace("Bearer ", "") : null;

    if (!apiKey) {
      return NextResponse.json({ error: "Missing Vast.ai API Key" }, { status: 400 });
    }

    // Call Vast.ai API
    const response = await fetch("https://console.vast.ai/api/v0/instances/", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      next: { revalidate: 0 }, // prevent static caching logic in next 13+
    });

    if (!response.ok) {
      throw new Error(`Vast.ai Request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("Vast.ai Proxy Error:", error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten") || "Proxy Fetch Error" }, { status: 500 });
  }
}
