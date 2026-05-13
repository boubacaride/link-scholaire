import { NextResponse } from "next/server";

async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.BIODIGITAL_DEVELOPER_KEY;
  const clientSecret = process.env.BIODIGITAL_DEVELOPER_SECRET;
  if (!clientId || !clientSecret) return null;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://apis.biodigital.com/oauth2/v2/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${credentials}` },
    body: "grant_type=client_credentials&scope=contentapi",
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

export async function GET() {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "OAuth2 credentials required. Set BIODIGITAL_DEVELOPER_SECRET in .env.local", models: [] }, { status: 200 });
  }

  try {
    const res = await fetch("https://apis.biodigital.com/services/v2/content/collections/myhuman", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Content API error: ${res.status}`, models: [] });
    }

    const data = await res.json();
    return NextResponse.json({ models: data });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch models", models: [] });
  }
}
