import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://gen-lang-client-0550261552.web.app";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/workspace/editor"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
