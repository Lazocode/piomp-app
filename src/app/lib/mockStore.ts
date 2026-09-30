// In-memory mock store for Supabase tables and storage
// This allows the app to boot and run seamlessly in AI Studio when Supabase credentials are not yet configured.

export interface FolderRecord {
  id: string;
  name: string;
  created_at: string;
}

export interface TagRecord {
  id: string;
  name: string;
  created_at: string;
}

export interface DocumentTagRecord {
  id: string;
  document_id: string;
  tag_id: string;
}

export interface StudyMessageRecord {
  id: string;
  document_id: string;
  role: 'user' | 'model';
  study_mode: string;
  content: string;
  created_at: string;
}

export interface DocumentRecord {
  id: string;
  folder_id: string | null;
  title: string;
  file_url: string;
  file_size?: number;
  ai_summary: string;
  created_at: string;
  folders?: { name: string } | null;
  document_tags?: { tags: { name: string } | null }[];
}

interface StoredFile {
  buffer: Buffer;
  contentType: string;
}

class MockDatabase {
  folders: FolderRecord[] = [
    {
      id: 'folder-1',
      name: 'Engenharia de Software',
      created_at: new Date('2026-01-15T10:00:00Z').toISOString(),
    },
  ];

  tags: TagRecord[] = [
    { id: 'tag-1', name: 'arquitetura', created_at: new Date().toISOString() },
    { id: 'tag-2', name: 'microsserviços', created_at: new Date().toISOString() },
    { id: 'tag-3', name: 'resiliência', created_at: new Date().toISOString() },
  ];

  document_tags: DocumentTagRecord[] = [
    { id: 'dt-1', document_id: 'doc-1', tag_id: 'tag-1' },
    { id: 'dt-2', document_id: 'doc-1', tag_id: 'tag-2' },
    { id: 'dt-3', document_id: 'doc-1', tag_id: 'tag-3' },
  ];

  documents: DocumentRecord[] = [
    {
      id: 'doc-1',
      folder_id: 'folder-1',
      title: 'Guia de Arquitetura de Software e Microsserviços.pdf',
      file_url: '/sample.pdf',
      file_size: 460800,
      ai_summary:
        'Visão abrangente sobre arquitetura de software moderna: padrões de desacoplamento, mensageria orientada a eventos, padrões de resiliência (Circuit Breaker e Retry com backoff) e observabilidade com tracing distribuído.',
      created_at: new Date('2026-02-10T14:30:00Z').toISOString(),
      folders: { name: 'Engenharia de Software' },
      document_tags: [
        { tags: { name: 'arquitetura' } },
        { tags: { name: 'microsserviços' } },
        { tags: { name: 'resiliência' } },
      ],
    },
  ];

  study_messages: StudyMessageRecord[] = [
    {
      id: 'msg-1',
      document_id: 'doc-1',
      role: 'user',
      study_mode: 'socratico',
      content: 'Qual a principal vantagem de usar mensageria assíncrona entre microsserviços?',
      created_at: new Date('2026-02-10T14:35:00Z').toISOString(),
    },
    {
      id: 'msg-2',
      document_id: 'doc-1',
      role: 'model',
      study_mode: 'socratico',
      content:
        'A mensageria assíncrona desacopla produtores e consumidores no tempo e no espaço, garantindo que o sistema continue operacional mesmo se um serviço falhar temporariamente. Mas pense no seguinte dilema: se os serviços estão desacoplados e não há bloqueio síncrono, como você lidaria com a consistência de dados entre eles caso uma etapa de um processo falhe?',
      created_at: new Date('2026-02-10T14:35:10Z').toISOString(),
    },
  ];

  storage: Map<string, StoredFile> = new Map();

  getDocuments() {
    return this.documents.map((doc) => {
      const folder = this.folders.find((f) => f.id === doc.folder_id);
      const docTags = this.document_tags
        .filter((dt) => dt.document_id === doc.id)
        .map((dt) => {
          const tag = this.tags.find((t) => t.id === dt.tag_id);
          return { tags: tag ? { name: tag.name } : null };
        });

      return {
        ...doc,
        folders: folder ? { name: folder.name } : null,
        document_tags: docTags,
      };
    });
  }

  getDocument(id: string) {
    return this.getDocuments().find((d) => d.id === id) || null;
  }

  deleteDocument(id: string) {
    this.documents = this.documents.filter((d) => d.id !== id);
    this.document_tags = this.document_tags.filter((dt) => dt.document_id !== id);
    this.study_messages = this.study_messages.filter((m) => m.document_id !== id);
  }

  getMessages(document_id: string) {
    return this.study_messages.filter((m) => m.document_id === document_id);
  }
}

// Global singleton across server invocations
const globalForMock = globalThis as unknown as { mockDb?: MockDatabase };
export const mockDb = globalForMock.mockDb ?? new MockDatabase();
if (process.env.NODE_ENV !== 'production') globalForMock.mockDb = mockDb;
