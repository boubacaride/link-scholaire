import { NextRequest, NextResponse } from "next/server";

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

export async function GET(req: NextRequest) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "OAuth2 credentials required", collections: [], models: [] });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const content = searchParams.get("content");

  try {
    let url = "https://apis.biodigital.com/services/v2/content/collections/mycollections";
    if (id) {
      url += `/${id}`;
      if (content === "true") url += "/content_list";
    }

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return NextResponse.json({ error: `API error: ${res.status}`, collections: [], models: [] });

    const data = await res.json();
    if (id && content === "true") {
      return NextResponse.json({ models: data });
    }
    return NextResponse.json({ collections: data });
  } catch {
    return NextResponse.json({ error: "Failed to fetch collections", collections: [], models: [] });
  }
}
