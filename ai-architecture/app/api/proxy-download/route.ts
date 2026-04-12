import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "No URL provided" }, { status: 400 });

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch from url: ${res.statusText}`);
    
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const extension = contentType.includes('video') ? 'mp4' : 'png';
    const filename = `studio_creation_${Date.now()}.${extension}`;
    
    return new NextResponse(res.body as any, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || String(error) }, { status: 500 });
  }
}
