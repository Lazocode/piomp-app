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

  // Medida de Segurança: Bloqueio de acesso não autorizado a PDFs protegidos
  const cookieHeader = _request.headers.get('cookie') || '';
  const authHeader = _request.headers.get('authorization') || '';
  const isSample = filename.toLowerCase().includes('sample');
  const hasSession = cookieHeader.includes('poimp_session') || Boolean(authHeader);

  if (!hasSession && !isSample) {
    return new NextResponse('Acesso restrito. Faça login para visualizar este documento.', {
      status: 401,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'WWW-Authenticate': 'Bearer error="unauthorized"',
      },
    });
  }

  const file = mockDb.storage.get(filename) || mockDb.storage.get(rawPath);

  if (!file) {
    return new NextResponse('Arquivo não encontrado', { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      'Content-Type': file.contentType || 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
