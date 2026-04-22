import { NextResponse } from 'next/server';

// See app/feed/route.ts — server-side fetch needs an absolute URL,
// INTERNAL_API_URL is the compose-network hostname.
const API_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8080/api/v1';

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/memos/feed`, {
      headers: { 'Accept': 'application/xml' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      console.warn(`[memos/feed] upstream ${res.status} from ${API_URL}/memos/feed`);
      return new NextResponse(
        `<rss version="2.0"><channel><title>Feed Error (upstream ${res.status})</title></channel></rss>`,
        { status: 502, headers: { 'Content-Type': 'application/xml' } }
      );
    }
    const xml = await res.text();
    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    console.warn(`[memos/feed] upstream fetch failed (${API_URL}/memos/feed):`, e);
    return new NextResponse(
      '<rss version="2.0"><channel><title>Feed Error</title></channel></rss>',
      { status: 500, headers: { 'Content-Type': 'application/xml' } }
    );
  }
}
