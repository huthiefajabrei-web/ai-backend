import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOST_SUFFIXES = [
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
  "googleusercontent.com",
];

function isUrlAllowed(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname)) return false;
    if (ALLOWED_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
      return true;
    }
    const apiBase = process.env.NEXT_PUBLIC_API_URL;
    if (apiBase) {
      const apiHost = new URL(apiBase).hostname.toLowerCase();
      if (hostname === apiHost) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "No URL provided" }, { status: 400 });
  if (!isUrlAllowed(url)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const res = await fetch(url, { cache: "no-store", redirect: "follow" });
    if (!res.ok) throw new Error("Failed to fetch remote file");
    const finalUrl = res.url || url;
    if (!isUrlAllowed(finalUrl)) {
      return NextResponse.json({ error: "Redirect target not allowed" }, { status: 403 });
    }

    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const extension = contentType.includes("video") ? "mp4" : "png";
    const filename = `studio_creation_${Date.now()}.${extension}`;

    return new NextResponse(res.body, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
