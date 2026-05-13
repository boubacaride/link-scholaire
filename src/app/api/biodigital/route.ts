import { NextResponse } from "next/server";

// Legacy route — redirects to /api/biodigital/token
export async function GET() {
  const dk = process.env.BIODIGITAL_DEVELOPER_KEY;
  if (!dk) {
    return NextResponse.json({ error: "BIODIGITAL_DEVELOPER_KEY not set" }, { status: 500 });
  }
  return NextResponse.json({ developerKey: dk, accessToken: dk, mode: "dk" });
}
