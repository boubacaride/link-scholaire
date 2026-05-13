// BioDigital Content API client — calls via Next.js API proxy

import type { ContentModel, ContentCollection } from "./types";

/** Get OAuth2 access token via our proxy */
export async function getToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/biodigital/token");
    if (!res.ok) return null;
    const data = await res.json();
    return data.accessToken || data.developerKey || null;
  } catch {
    return null;
  }
}

/** Fetch models from "myhuman" collection */
export async function getMyHumanModels(): Promise<ContentModel[]> {
  try {
    const res = await fetch("/api/biodigital/myhuman");
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}

/** Fetch all collections */
export async function getCollections(): Promise<ContentCollection[]> {
  try {
    const res = await fetch("/api/biodigital/collections");
    if (!res.ok) return [];
    const data = await res.json();
    return data.collections || [];
  } catch {
    return [];
  }
}

/** Fetch models within a specific collection */
export async function getCollectionModels(collectionId: string): Promise<ContentModel[]> {
  try {
    const res = await fetch(`/api/biodigital/collections?id=${collectionId}&content=true`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.models || [];
  } catch {
    return [];
  }
}
