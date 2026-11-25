import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/season";

const BASE = SITE_URL;

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/app", "/guide", "/about", "/risers", "/accuracy", "/privacy", "/terms"].map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly", priority: p ? 0.7 : 1 }));
}
