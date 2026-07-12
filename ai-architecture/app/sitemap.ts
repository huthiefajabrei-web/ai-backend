import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://gen-lang-client-0550261552.web.app";
  const now = new Date();

  return [
    { url: baseUrl, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/video`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/workspace`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];
}
