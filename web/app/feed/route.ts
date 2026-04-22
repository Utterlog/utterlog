import { NextResponse } from 'next/server';

// Server-side (Node) fetch needs an absolute URL. In Docker prod,
// INTERNAL_API_URL=http://api:8080/api/v1 talks over the compose
// network; NEXT_PUBLIC_API_URL=/api/v1 is for the browser and
// cannot be used here (relative URLs throw in server fetch → the
// old "Feed Error" stub).
const API_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8080/api/v1';

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/feed`, {
      headers: { 'Accept': 'application/xml' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      console.warn(`[feed] upstream ${res.status} from ${API_URL}/feed`);
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
    console.warn(`[feed] upstream fetch failed (${API_URL}/feed):`, e);
    return new NextResponse(
      '<rss version="2.0"><channel><title>Feed Error</title></channel></rss>',
      { status: 500, headers: { 'Content-Type': 'application/xml' } }
    );
  }
}
