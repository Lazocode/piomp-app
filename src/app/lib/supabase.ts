import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { mockDb, DocumentRecord } from './mockStore';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isRealSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseKey &&
    supabaseUrl.startsWith('http') &&
    !supabaseUrl.includes('placeholder') &&
    !supabaseUrl.includes('your-project')
);

function createMockSupabaseClient() {
  return {
    from(table: string) {
      const isClient = typeof window !== 'undefined';

      return {
        select() {
          let filterCol: string | null = null;
          let filterVal: unknown = null;

          const queryObj = {
            eq(col: string, val: unknown) {
              filterCol = col;
              filterVal = val;
              return queryObj;
            },
            order() {
              return queryObj;
            },
            limit() {
              return queryObj;
            },
            maybeSingle: async () => {
              const res = await queryObj;
              return {
                data: Array.isArray(res.data) ? (res.data[0] ?? null) : (res.data ?? null),
                error: null,
              };
            },
            single: async () => {
              const res = await queryObj;
              return {
                data: Array.isArray(res.data) ? (res.data[0] ?? null) : (res.data ?? null),
                error: null,
              };
            },
            then(resolve: (val: { data: unknown; error: null }) => void) {
              if (isClient) {
                let url = `/api/mock-db?table=${table}`;
                if (filterCol && filterVal) {
                  url += `&${filterCol}=${encodeURIComponent(String(filterVal))}`;
                }
                return fetch(url)
                  .then((r) => r.json())
                  .then((json) => {
                    resolve({ data: json.data, error: null });
                  })
                  .catch(() => {
                    resolve({ data: [], error: null });
                  });
              }

              // Server-side direct access
              if (table === 'documents') {
                if (filterCol === 'id' && filterVal) {
                  const doc = mockDb.getDocument(String(filterVal));
                  return Promise.resolve(resolve({ data: doc, error: null }));
                }
                return Promise.resolve(resolve({ data: mockDb.getDocuments(), error: null }));
              }

              if (table === 'folders') {
                if (filterCol === 'name' && filterVal) {
                  const folder = mockDb.folders.find((f) => f.name === filterVal);
                  return Promise.resolve(resolve({ data: folder || null, error: null }));
                }
                return Promise.resolve(resolve({ data: mockDb.folders, error: null }));
              }

              if (table === 'tags') {
                if (filterCol === 'name' && filterVal) {
                  const tag = mockDb.tags.find((t) => t.name === filterVal);
                  return Promise.resolve(resolve({ data: tag || null, error: null }));
                }
                return Promise.resolve(resolve({ data: mockDb.tags, error: null }));
              }

              if (table === 'study_messages') {
                if (filterCol === 'document_id' && filterVal) {
                  const msgs = mockDb.getMessages(String(filterVal));
                  return Promise.resolve(resolve({ data: msgs, error: null }));
                }
                return Promise.resolve(resolve({ data: mockDb.study_messages, error: null }));
              }

              return Promise.resolve(resolve({ data: [], error: null }));
            },
          };

          return queryObj;
        },

        insert(values: unknown) {
          return {
            select() {
              return {
                single: async () => {
                  const items = Array.isArray(values) ? values : [values];
                  const item = items[0] as Record<string, unknown>;

                  if (table === 'folders') {
                    const newFolder = {
                      id: `folder-${crypto.randomUUID()}`,
                      name: String(item.name || ''),
                      created_at: new Date().toISOString(),
                    };
                    mockDb.folders.push(newFolder);
                    return { data: newFolder, error: null };
                  }

                  if (table === 'tags') {
                    const newTag = {
                      id: `tag-${crypto.randomUUID()}`,
                      name: String(item.name || ''),
                      created_at: new Date().toISOString(),
                    };
                    mockDb.tags.push(newTag);
                    return { data: newTag, error: null };
                  }

                  if (table === 'documents') {
                    const newDoc: DocumentRecord = {
                      id: `doc-${crypto.randomUUID()}`,
                      folder_id: (item.folder_id as string) || null,
                      title: String(item.title || ''),
                      file_url: String(item.file_url || ''),
                      file_size: (item.file_size as number) || 0,
                      ai_summary: String(item.ai_summary || ''),
                      created_at: new Date().toISOString(),
                    };
                    mockDb.documents.unshift(newDoc);
                    return { data: mockDb.getDocument(newDoc.id), error: null };
                  }

                  return { data: item, error: null };
                },
              };
            },
            then(resolve: (val: { data: unknown; error: null }) => void) {
              const items = Array.isArray(values) ? values : [values];

              if (table === 'document_tags') {
                for (const dt of items as { document_id: string; tag_id: string }[]) {
                  mockDb.document_tags.push({
                    id: `dt-${crypto.randomUUID()}`,
                    document_id: dt.document_id,
                    tag_id: dt.tag_id,
                  });
                }
              }

              if (table === 'study_messages') {
                for (const msg of items as { document_id: string; role: 'user' | 'model'; study_mode: string; content: string }[]) {
                  mockDb.study_messages.push({
                    id: `msg-${crypto.randomUUID()}`,
                    document_id: msg.document_id,
                    role: msg.role,
                    study_mode: msg.study_mode || 'socratico',
                    content: msg.content,
                    created_at: new Date().toISOString(),
                  });
                }
              }

              return Promise.resolve(resolve({ data: items, error: null }));
            },
          };
        },

        delete() {
          return {
            eq: async (col: string, val: unknown) => {
              if (isClient) {
                await fetch('/api/mock-db', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: 'delete',
                    table,
                    payload: { [col]: val },
                  }),
                });
                return { error: null };
              }

              if (table === 'documents' && col === 'id') {
                mockDb.deleteDocument(String(val));
              }
              return { error: null };
            },
          };
        },
      };
    },

    storage: {
      from() {
        return {
          upload: async (path: string, fileData: unknown, options?: { contentType?: string }) => {
            let buffer: Buffer;
            if (Buffer.isBuffer(fileData)) {
              buffer = fileData;
            } else if (fileData instanceof ArrayBuffer) {
              buffer = Buffer.from(fileData);
            } else if (fileData instanceof Uint8Array) {
              buffer = Buffer.from(fileData);
            } else {
              buffer = Buffer.from(String(fileData));
            }

            mockDb.storage.set(path, {
              buffer,
              contentType: options?.contentType || 'application/pdf',
            });

            return { data: { path }, error: null };
          },
          getPublicUrl(path: string) {
            return {
              data: {
                publicUrl: `/api/storage/pdfs/${encodeURIComponent(path)}`,
              },
            };
          },
          remove: async (paths: string[]) => {
            for (const p of paths) {
              mockDb.storage.delete(p);
            }
            return { data: null, error: null };
          },
        };
      },
    },
  };
}

export const supabase: SupabaseClient = (
  isRealSupabaseConfigured
    ? createClient(supabaseUrl!, supabaseKey!)
    : (createMockSupabaseClient() as unknown)
) as SupabaseClient;
