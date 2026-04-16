import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';

// Allow cross-origin POST from admin SPA (which runs on a different port in dev)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  try {
    // Optional: POST body `{ paths: ['/', '/posts/slug'], tags: ['theme', 'posts'] }`
    let paths: string[] = ['/'];
    let tags: string[] = [];
    try {
      const body = await req.json();
      if (Array.isArray(body?.paths)) paths = body.paths;
      if (Array.isArray(body?.tags)) tags = body.tags;
    } catch {
      // empty body is fine — revalidate root layout only
    }

    for (const p of paths) revalidatePath(p, 'layout');
    for (const t of tags) revalidateTag(t);

    return NextResponse.json(
      { success: true, message: 'Cache cleared', paths, tags },
      { headers: CORS_HEADERS },
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: 'Failed to clear cache', error: err?.message },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
