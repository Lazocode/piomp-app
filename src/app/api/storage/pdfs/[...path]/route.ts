import { NextResponse } from 'next/server';
import { mockDb } from '../../../../lib/mockStore';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const rawPath = path.join('/');
  let filename = rawPath;
  try {
    filename = decodeURIComponent(rawPath);
  } catch {
    filename = rawPath;
  }
  const file = mockDb.storage.get(filename) || mockDb.storage.get(rawPath);

  if (!file) {
    return new NextResponse('File not found', { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      'Content-Type': file.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
