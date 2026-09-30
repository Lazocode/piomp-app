import { NextResponse } from 'next/server';
import { mockDb } from '../../lib/mockStore';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table');

  if (table === 'documents') {
    return NextResponse.json({ data: mockDb.getDocuments() });
  }

  if (table === 'study_messages') {
    const documentId = searchParams.get('document_id');
    const messages = mockDb.getMessages(documentId || '');
    return NextResponse.json({
      data: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  }

  return NextResponse.json({ data: [] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, table, payload } = body;

    if (action === 'delete' && table === 'documents') {
      mockDb.deleteDocument(payload.id);
      return NextResponse.json({ success: true });
    }

    if (action === 'insert' && table === 'study_messages') {
      const messages = Array.isArray(payload) ? payload : [payload];
      for (const msg of messages) {
        mockDb.study_messages.push({
          id: `msg-${crypto.randomUUID()}`,
          document_id: msg.document_id,
          role: msg.role,
          study_mode: msg.study_mode || 'socratico',
          content: msg.content,
          created_at: new Date().toISOString(),
        });
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || 'Database error' },
      { status: 500 }
    );
  }
}
