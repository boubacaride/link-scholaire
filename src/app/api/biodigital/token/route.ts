import { NextResponse } from "next/server";

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function GET() {
  const clientId = process.env.BIODIGITAL_DEVELOPER_KEY;
  const clientSecret = process.env.BIODIGITAL_DEVELOPER_SECRET;

  if (!clientId) {
    return NextResponse.json({ error: "BIODIGITAL_DEVELOPER_KEY not set" }, { status: 500 });
  }

  // No secret → return developer key directly
  if (!clientSecret) {
    return NextResponse.json({ developerKey: clientId, mode: "dk" });
  }

  // Return cached token if valid
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return NextResponse.json({ accessToken: cachedToken.token, mode: "token" });
  }

  // OAuth2 client_credentials exchange
  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://apis.biodigital.com/oauth2/v2/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: "grant_type=client_credentials&scope=contentapi",
    });

    if (!res.ok) {
      return NextResponse.json({ developerKey: clientId, mode: "dk" });
    }

    const data = await res.json();
    cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
    return NextResponse.json({ accessToken: data.access_token, mode: "token" });
  } catch {
    return NextResponse.json({ developerKey: clientId, mode: "dk" });
  }
}
