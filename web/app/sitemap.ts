import type { MetadataRoute } from "next";

const BASE = "https://redraftsim.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/risers", "/accuracy"].map((p) => ({ url: `${BASE}${p}`, changeFrequency: "weekly", priority: p ? 0.7 : 1 }));
}
