import 'server-only';
import { NextResponse } from 'next/server';

/**
 * JSON with CDN caching (`s-maxage`) plus a long stale window, so a slow or failing upstream
 * is served from the edge cache while it revalidates in the background.
 */
export async function cached<T>(seconds: number, load: () => Promise<T>) {
  try {
    const data = await load();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${seconds * 10}` },
    });
  } catch (error) {
    console.error('[live]', (error as Error).message);
    return NextResponse.json(
      { error: 'upstream_unavailable' },
      { status: 502, headers: { 'Cache-Control': 'public, s-maxage=15' } },
    );
  }
}
