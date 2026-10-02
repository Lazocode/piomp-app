'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Folder,
  FolderPlus,
  FolderOpen,
  FileText,
  Plus,
  Search,
  Trash2,
  Edit3,
  Check,
  Copy,
  Download,
  Columns,
  Eye,
  BookOpen,
  List,
  ListOrdered,
  ListTodo,
  Heading1,
  Heading2,
  Heading3,
  Code,
  Quote,
  Table as TableIcon,
  Bold,
  Italic,
  Link2,
  Minus,
  X,
  ChevronLeft,
  Pin,
  Clock,
  FilePlus2,
} from 'lucide-react';

export interface NoteFolder {
  id: string;
  name: string;
  created_at: string;
}

export interface NoteItem {
  id: string;
  folder_id: string | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  pinned?: boolean;
}

interface NotesWorkspaceProps {
  userId?: string;
  initialNoteDraft?: {
    title: string;
    content: string;
    folderName?: string;
  } | null;
  onClearDraft?: () => void;
}

const DEFAULT_FOLDERS: NoteFolder[] = [
  {
    id: 'folder-geral',
    name: 'Geral',
    created_at: new Date('2026-01-10T10:00:00Z').toISOString(),
  },
  {
    id: 'folder-eng',
    name: 'Engenharia de Software',
    created_at: new Date('2026-01-15T12:00:00Z').toISOString(),
  },
  {
    id: 'folder-resumos',
    name: 'Resumos de Leitura',
    created_at: new Date('2026-02-01T09:30:00Z').toISOString(),
  },
];

const DEFAULT_NOTES: NoteItem[] = [
  {
    id: 'note-welcome',
    folder_id: 'folder-geral',
    title: 'Guia de Sintaxe Markdown',
    pinned: true,
    content: `# Bem-vindo ao Caderno de Anotações

Este é um ambiente dedicado para registrar ideias, notas de aulas, resumos de artigos e especificações técnicas, com suporte integral à sintaxe **Markdown**.

---

## 1. Destaques de Formatação

Você pode utilizar marcações simples para estruturar seu pensamento:

- **Negrito**: Destaque termos cruciais com \`**texto**\`
- *Itálico*: Enfatize ideias secundárias com \`*texto*\`
- ~~Tachado~~: Indique termos descontinuados com \`~~texto~~\`
- \`Código Inline\`: Destaque métodos ou comandos com crases

### Bloco de Código Técnico

\`\`\`typescript
interface NotePayload {
  title: string;
  markdownContent: string;
  tags: string[];
}

export function parseNote(payload: NotePayload): void {
  console.log("Nota registrada com sucesso:", payload.title);
}
\`\`\`

---

## 2. Listas e Checklists

- [x] Criar estrutura de pastas organizada
- [x] Configurar suporte nativo a Markdown
- [ ] Revisar anotações do próximo capítulo

---

## 3. Citações Reflexivas

> "A clareza de pensamento precede a clareza de código. Anotar e estruturar problemas antes de codificar economiza horas de depuração."

---

## 4. Tabela de Padrões Arquiteturais

| Padrão | Aplicação | Vantagem Principal |
| :--- | :--- | :--- |
| **Circuit Breaker** | Resiliência em microsserviços | Evita cascata de falhas |
| **Outbox Pattern** | Consistência eventual | Mensagens atômicas sem 2PC |
| **CQRS** | Segregação de leitura e escrita | Otimização independente |
`,
    created_at: new Date('2026-02-15T10:00:00Z').toISOString(),
    updated_at: new Date('2026-02-15T10:00:00Z').toISOString(),
  },
  {
    id: 'note-microservices',
    folder_id: 'folder-eng',
    title: 'Padrões de Resiliência em Sistemas Distribuídos',
    pinned: false,
    content: `# Resiliência e Tolerância a Falhas

Anotações técnicas sobre mitigação de falhas em ambientes de nuvem:

### Princípios Chave
1. **Falha é inevitável**: Projete para recuperação contínua.
2. **Isolamento de recursos (Bulkhead)**: Separe pools de conexão para dependências críticas.
3. **Timeouts estritos**: Nunca realize chamadas RPC sem tempo limite definido.

\`\`\`yaml
resilience:
  circuit_breaker:
    failure_rate_threshold: 50
    wait_duration_in_open_state: 10s
    permitted_number_of_calls_in_half_open_state: 3
\`\`\`
`,
    created_at: new Date('2026-02-20T14:00:00Z').toISOString(),
    updated_at: new Date('2026-02-20T14:00:00Z').toISOString(),
  },
];

export default function NotesWorkspace({
  userId,
  initialNoteDraft,
  onClearDraft,
}: NotesWorkspaceProps) {
  const storagePrefix = `poimp_app_${userId || 'guest'}`;

  // Inicialização preguiçosa (Lazy Initializer) lendo do localStorage sem causar cascata de re-renders
  const [folders, setFolders] = useState<NoteFolder[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_FOLDERS;
    try {
      const saved = localStorage.getItem(`${storagePrefix}_folders`);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignora falha de parse
    }
    return DEFAULT_FOLDERS;
  });

  const [notes, setNotes] = useState<NoteItem[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_NOTES;
    try {
      const saved = localStorage.getItem(`${storagePrefix}_notes`);
      if (saved) return JSON.parse(saved);
    } catch {
      // Ignora falha de parse
    }
    return DEFAULT_NOTES;
  });

  const [selectedFolderId, setSelectedFolderId] = useState<string | 'ALL' | 'UNORGANIZED'>('ALL');
  
  const [activeNoteId, setActiveNoteId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return DEFAULT_NOTES[0].id;
    try {
      const saved = localStorage.getItem(`${storagePrefix}_notes`);
      if (saved) {
        const parsed: NoteItem[] = JSON.parse(saved);
        if (parsed.length > 0) return parsed[0].id;
      }
    } catch {
      // Ignora falha de parse
    }
    return DEFAULT_NOTES[0].id;
  });

  // Busca e Filtros
  const [searchQuery, setSearchQuery] = useState('');

  // Modos de Visualização
  const [viewMode, setViewMode] = useState<'split' | 'edit' | 'preview'>('split');

  // Navegação responsiva para dispositivos móveis
  const [mobileView, setMobileView] = useState<'folders' | 'notes' | 'editor'>('notes');

  // Controle de criação / edição de pastas
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [folderToDelete, setFolderToDelete] = useState<NoteFolder | null>(null);

  // Notificações e feedback
  const [copiedNote, setCopiedNote] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // Referência do textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const triggerNotification = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 3500);
  }, []);

  // Persistir pastas automaticamente quando mudam
  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}_folders`, JSON.stringify(folders));
    } catch {
      // Falha silenciosa de quota
    }
  }, [folders, storagePrefix]);

  // Persistir anotações automaticamente quando mudam
  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}_notes`, JSON.stringify(notes));
    } catch {
      // Falha silenciosa de quota
    }
  }, [notes, storagePrefix]);

  // Inserção automática de rascunho vindo de PDFs ou Estudos (com proteção de ref)
  const handledDraftRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialNoteDraft) return;
    const draftKey = `${initialNoteDraft.title}_${initialNoteDraft.content.substring(0, 30)}`;
    if (handledDraftRef.current === draftKey) return;
    handledDraftRef.current = draftKey;

    const timer = setTimeout(() => {
      let targetFolderId: string | null = null;
      if (initialNoteDraft.folderName) {
        const found = folders.find(
          (f) => f.name.toLowerCase() === initialNoteDraft.folderName?.toLowerCase()
        );
        if (found) {
          targetFolderId = found.id;
        } else {
          const newFolder: NoteFolder = {
            id: `folder-${Date.now()}`,
            name: initialNoteDraft.folderName,
            created_at: new Date().toISOString(),
          };
          setFolders((prev) => [...prev, newFolder]);
          targetFolderId = newFolder.id;
        }
      }

      const newNote: NoteItem = {
        id: `note-${Date.now()}`,
        folder_id: targetFolderId,
        title: initialNoteDraft.title || 'Anotação Importada',
        content: initialNoteDraft.content || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        pinned: false,
      };

      setNotes((prev) => [newNote, ...prev]);
      setActiveNoteId(newNote.id);
      setMobileView('editor');
      triggerNotification('Nova anotação criada com os dados do estudo.');

      if (onClearDraft) {
        onClearDraft();
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [initialNoteDraft, folders, onClearDraft, triggerNotification]);

  // Obter anotação atualmente selecionada
  const activeNote = useMemo(() => {
    return notes.find((n) => n.id === activeNoteId) || null;
  }, [notes, activeNoteId]);

  // Contagem de notas por pasta
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: notes.length,
      UNORGANIZED: 0,
    };

    folders.forEach((f) => {
      counts[f.id] = 0;
    });

    notes.forEach((n) => {
      if (!n.folder_id) {
        counts.UNORGANIZED += 1;
      } else if (counts[n.folder_id] !== undefined) {
        counts[n.folder_id] += 1;
      } else {
        counts.UNORGANIZED += 1;
      }
    });

    return counts;
  }, [folders, notes]);

  // Anotações filtradas por pasta e busca
  const filteredNotes = useMemo(() => {
    return notes
      .filter((note) => {
        // Filtro por pasta
        if (selectedFolderId === 'ALL') {
          // Passa todas
        } else if (selectedFolderId === 'UNORGANIZED') {
          if (note.folder_id) return false;
        } else {
          if (note.folder_id !== selectedFolderId) return false;
        }

        // Filtro por termo de busca
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim();
          const matchTitle = note.title.toLowerCase().includes(query);
          const matchContent = note.content.toLowerCase().includes(query);
          if (!matchTitle && !matchContent) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  }, [notes, selectedFolderId, searchQuery]);

  // Ações de Anotação
  const handleCreateNote = () => {
    const newNote: NoteItem = {
      id: `note-${Date.now()}`,
      folder_id:
        selectedFolderId !== 'ALL' && selectedFolderId !== 'UNORGANIZED'
          ? selectedFolderId
          : folders[0]?.id || null,
      title: 'Nova Anotação',
      content: `# Nova Anotação\n\nComece a escrever em Markdown aqui...`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pinned: false,
    };

    setNotes((prev) => [newNote, ...prev]);
    setActiveNoteId(newNote.id);
    setMobileView('editor');
    triggerNotification('Anotação criada com sucesso.');
  };

  const handleUpdateActiveNote = (updates: Partial<NoteItem>) => {
    if (!activeNote) return;

    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === activeNote.id) {
          return {
            ...n,
            ...updates,
            updated_at: new Date().toISOString(),
          };
        }
        return n;
      })
    );
  };

  const handleDeleteNote = (noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));

    if (activeNoteId === noteId) {
      const remainingFiltered = filteredNotes.filter((n) => n.id !== noteId);
      setActiveNoteId(remainingFiltered[0]?.id || null);
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setMobileView('notes');
      }
    }

    triggerNotification('Anotação excluída.');
  };

  const handleTogglePin = (noteId: string) => {
    setNotes((prev) =>
      prev.map((n) => {
        if (n.id === noteId) {
          return { ...n, pinned: !n.pinned };
        }
        return n;
      })
    );
  };

  // Ações de Pasta
  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;

    if (folders.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
      triggerNotification('Já existe uma pasta com este nome.', 'error');
      return;
    }

    const newFolder: NoteFolder = {
      id: `folder-${Date.now()}`,
      name: trimmed,
      created_at: new Date().toISOString(),
    };

    setFolders((prev) => [...prev, newFolder]);
    setNewFolderName('');
    setIsCreatingFolder(false);
    setSelectedFolderId(newFolder.id);
    triggerNotification(`Pasta "${trimmed}" criada.`);
  };

  const handleRenameFolder = (folderId: string) => {
    const trimmed = editingFolderName.trim();
    if (!trimmed) {
      setEditingFolderId(null);
      return;
    }

    setFolders((prev) =>
      prev.map((f) => {
        if (f.id === folderId) {
          return { ...f, name: trimmed };
        }
        return f;
      })
    );

    setEditingFolderId(null);
    setEditingFolderName('');
    triggerNotification('Pasta renomeada.');
  };

  const confirmDeleteFolder = () => {
    if (!folderToDelete) return;
    const targetId = folderToDelete.id;

    // Move notas da pasta deletada para sem pasta
    setNotes((prev) =>
      prev.map((n) => {
        if (n.folder_id === targetId) {
          return { ...n, folder_id: null };
        }
        return n;
      })
    );

    setFolders((prev) => prev.filter((f) => f.id !== targetId));

    if (selectedFolderId === targetId) {
      setSelectedFolderId('ALL');
    }

    triggerNotification(`Pasta "${folderToDelete.name}" removida. Anotações foram preservadas.`);
    setFolderToDelete(null);
  };

  // Utilitários de Markdown Toolbar
  const insertMarkdownSyntax = (before: string, after: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea || !activeNote) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const previousContent = activeNote.content;

    const selectedText = previousContent.substring(start, end) || defaultText;
    const replacement = `${before}${selectedText}${after}`;

    const newContent =
      previousContent.substring(0, start) + replacement + previousContent.substring(end);

    handleUpdateActiveNote({ content: newContent });

    setTimeout(() => {
      textarea.focus();
      const cursorPosition = start + before.length + selectedText.length;
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    }, 10);
  };

  // Exportar e Copiar
  const handleCopyMarkdown = () => {
    if (!activeNote) return;
    navigator.clipboard.writeText(activeNote.content);
    setCopiedNote(true);
    setTimeout(() => setCopiedNote(false), 2000);
    triggerNotification('Markdown copiado para a área de transferência.');
  };

  const handleDownloadMarkdown = () => {
    if (!activeNote) return;
    const blob = new Blob([activeNote.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = activeNote.title
      .toLowerCase()
      .replace(/[^a-z0-9]/gi, '_')
      .replace(/_+/g, '_');
    link.href = url;
    link.download = `${safeTitle || 'anotacao'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    triggerNotification('Download do arquivo .md iniciado.');
  };

  // Estatísticas de leitura da anotação ativa
  const stats = useMemo(() => {
    if (!activeNote) return { words: 0, characters: 0, readTimeMinutes: 0 };
    const text = activeNote.content.trim();
    const characters = text.length;
    const words = text ? text.split(/\s+/).length : 0;
    const readTimeMinutes = Math.max(1, Math.ceil(words / 180));
    return { words, characters, readTimeMinutes };
  }, [activeNote]);

  const activeFolderName = useMemo(() => {
    if (!activeNote?.folder_id) return 'Sem Pasta';
    const found = folders.find((f) => f.id === activeNote.folder_id);
    return found ? found.name : 'Sem Pasta';
  }, [activeNote, folders]);

  return (
    <div className="flex-1 flex flex-col h-[calc(100dvh-4.2rem)] overflow-hidden bg-[#09090b]">
      {/* Notificação Flutuante */}
      {notification && (
        <div className="fixed top-16 right-4 sm:right-6 z-50">
          <div
            className={`px-4 py-2.5 rounded-xl border shadow-xl flex items-center gap-2.5 text-xs sm:text-sm font-semibold transition-all ${
              notification.type === 'success'
                ? 'bg-zinc-900 border-purple-500/80 text-purple-200'
                : 'bg-zinc-900 border-red-500/80 text-red-200'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Modal de Confirmação para Excluir Pasta */}
      {folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-400" />
              Remover Pasta?
            </h3>
            <p className="text-xs text-zinc-300 leading-relaxed mb-4">
              A pasta <strong className="text-white">&quot;{folderToDelete.name}&quot;</strong> será excluída.
              As anotações nela não serão perdidas; elas serão movidas para &quot;Sem Pasta&quot;.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setFolderToDelete(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteFolder}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-500 transition-colors cursor-pointer"
              >
                Excluir Pasta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Navegação Móvel (Aparece apenas em telas < md) */}
      <div className="md:hidden border-b border-zinc-800 bg-zinc-950/80 px-3 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setMobileView('folders')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              mobileView === 'folders' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Pastas ({folders.length})
          </button>
          <span className="text-zinc-600">/</span>
          <button
            type="button"
            onClick={() => setMobileView('notes')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
              mobileView === 'notes' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Notas ({filteredNotes.length})
          </button>
          {activeNote && (
            <>
              <span className="text-zinc-600">/</span>
              <button
                type="button"
                onClick={() => setMobileView('editor')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-colors truncate max-w-[130px] ${
                  mobileView === 'editor' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {activeNote.title || 'Sem título'}
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleCreateNote}
          className="p-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors"
          title="Nova Anotação"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Grid Principal de 3 Colunas: 
          Col 1: Pastas (Sidebar Esquerda)
          Col 2: Lista de Anotações (Painel Central)
          Col 3: Espaço de Escrita & Preview Markdown (Painel Maior)
      */}
      <div className="flex-1 flex overflow-hidden">
        {/* =========================================================
            COLUNA 1: GESTÃO DE PASTAS
        ========================================================= */}
        <aside
          className={`w-full md:w-56 lg:w-64 border-r border-zinc-800 bg-zinc-950/60 flex-col shrink-0 ${
            mobileView === 'folders' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* Header da Coluna de Pastas */}
          <div className="p-3 border-b border-zinc-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-purple-400 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                Pastas
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsCreatingFolder(true)}
              title="Nova Pasta"
              className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>

          {/* Formulário de Nova Pasta */}
          {isCreatingFolder && (
            <form onSubmit={handleCreateFolder} className="p-2 border-b border-zinc-800 bg-zinc-900/60">
              <input
                type="text"
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Nome da pasta..."
                className="w-full bg-zinc-950 border border-purple-500 rounded-lg text-xs text-white px-2.5 py-1.5 placeholder:text-zinc-500 focus:outline-none mb-1.5"
              />
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingFolder(false);
                    setNewFolderName('');
                  }}
                  className="px-2 py-1 text-[11px] font-medium text-zinc-400 hover:text-white rounded cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded disabled:opacity-50 cursor-pointer"
                >
                  Criar
                </button>
              </div>
            </form>
          )}

          {/* Lista de Pastas */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {/* Todas as Anotações */}
            <button
              type="button"
              onClick={() => {
                setSelectedFolderId('ALL');
                if (typeof window !== 'undefined' && window.innerWidth < 768) setMobileView('notes');
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${
                selectedFolderId === 'ALL'
                  ? 'bg-purple-950/60 text-purple-200 border border-purple-800/60'
                  : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <BookOpen className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                <span className="truncate">Todas as Notas</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">{folderCounts.ALL}</span>
            </button>

            {/* Pastas Personalizadas */}
            {folders.map((folder) => {
              const isSelected = selectedFolderId === folder.id;
              const isEditing = editingFolderId === folder.id;

              if (isEditing) {
                return (
                  <div key={folder.id} className="p-1 bg-zinc-900 rounded-lg">
                    <input
                      type="text"
                      autoFocus
                      value={editingFolderName}
                      onChange={(e) => setEditingFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameFolder(folder.id);
                        if (e.key === 'Escape') setEditingFolderId(null);
                      }}
                      className="w-full bg-zinc-950 border border-purple-500 rounded px-2 py-1 text-xs text-white focus:outline-none mb-1"
                    />
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingFolderId(null)}
                        className="px-2 py-0.5 text-[10px] text-zinc-400 hover:text-white"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRenameFolder(folder.id)}
                        className="px-2 py-0.5 text-[10px] bg-purple-600 text-white rounded cursor-pointer"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={folder.id}
                  className={`group w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-purple-950/60 text-purple-200 border border-purple-800/60'
                      : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFolderId(folder.id);
                      if (typeof window !== 'undefined' && window.innerWidth < 768) setMobileView('notes');
                    }}
                    className="flex-1 flex items-center gap-2 truncate text-left mr-1 cursor-pointer"
                  >
                    <Folder className="w-3.5 h-3.5 text-purple-400/90 shrink-0" />
                    <span className="truncate">{folder.name}</span>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] font-mono text-zinc-400 group-hover:hidden">
                      {folderCounts[folder.id] || 0}
                    </span>
                    <div className="hidden group-hover:flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFolderId(folder.id);
                          setEditingFolderName(folder.name);
                        }}
                        title="Renomear Pasta"
                        className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFolderToDelete(folder)}
                        title="Excluir Pasta"
                        className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Sem Pasta (Desorganizadas) */}
            <button
              type="button"
              onClick={() => {
                setSelectedFolderId('UNORGANIZED');
                if (typeof window !== 'undefined' && window.innerWidth < 768) setMobileView('notes');
              }}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium transition-all text-left cursor-pointer ${
                selectedFolderId === 'UNORGANIZED'
                  ? 'bg-purple-950/60 text-purple-200 border border-purple-800/60'
                  : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Minus className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="truncate">Sem Pasta</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-400">{folderCounts.UNORGANIZED}</span>
            </button>
          </div>
        </aside>

        {/* =========================================================
            COLUNA 2: LISTA DE ANOTAÇÕES
        ========================================================= */}
        <section
          className={`w-full md:w-64 lg:w-72 xl:w-80 border-r border-zinc-800 bg-zinc-900/40 flex-col shrink-0 ${
            mobileView === 'notes' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* Header da Lista de Notas com Busca */}
          <div className="p-3 border-b border-zinc-800 space-y-2.5 shrink-0 bg-zinc-950/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Anotações
              </span>
              <button
                type="button"
                onClick={handleCreateNote}
                className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova</span>
              </button>
            </div>

            {/* Campo de Busca de Notas */}
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 absolute left-2.5 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filtrar por título ou texto..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-100 pl-8 pr-7 py-1.5 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 p-0.5 text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Lista Rolável de Cards de Anotações */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {filteredNotes.length === 0 ? (
              <div className="py-12 text-center px-4">
                <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-zinc-300 mb-1">Nenhuma anotação encontrada</p>
                <p className="text-[11px] text-zinc-500 mb-3">
                  {searchQuery
                    ? 'Tente outro termo de busca.'
                    : 'Crie uma nova anotação para começar.'}
                </p>
                <button
                  type="button"
                  onClick={handleCreateNote}
                  className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 font-medium cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Criar anotação agora
                </button>
              </div>
            ) : (
              filteredNotes.map((note) => {
                const isSelected = activeNoteId === note.id;
                const noteFolder = folders.find((f) => f.id === note.folder_id);

                return (
                  <div
                    key={note.id}
                    onClick={() => {
                      setActiveNoteId(note.id);
                      if (typeof window !== 'undefined' && window.innerWidth < 768) setMobileView('editor');
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setActiveNoteId(note.id);
                        if (typeof window !== 'undefined' && window.innerWidth < 768) setMobileView('editor');
                      }
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative group flex flex-col justify-between ${
                      isSelected
                        ? 'bg-purple-950/40 border-purple-500 text-white shadow-sm ring-1 ring-purple-500/40'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/60 text-zinc-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {note.pinned && (
                          <Pin className="w-3 h-3 text-purple-400 shrink-0 fill-purple-400" />
                        )}
                        <h4 className="text-xs sm:text-sm font-semibold truncate text-zinc-100 group-hover:text-purple-200 transition-colors">
                          {note.title || 'Sem título'}
                        </h4>
                      </div>

                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTogglePin(note.id);
                          }}
                          title={note.pinned ? 'Desafixar' : 'Fixar no topo'}
                          className="p-1 rounded text-zinc-400 hover:text-purple-300 hover:bg-zinc-800 cursor-pointer"
                        >
                          <Pin
                            className={`w-3 h-3 ${note.pinned ? 'fill-purple-400 text-purple-400' : ''}`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNote(note.id);
                          }}
                          title="Excluir nota"
                          className="p-1 rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Prévia do texto Markdown */}
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed mb-2 font-normal">
                      {note.content.replace(/[#*`_~>[\]]/g, '').trim() || 'Anotação vazia...'}
                    </p>

                    {/* Metadados limpos sem pill enclosures */}
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-1 border-t border-zinc-800/60">
                      <span className="truncate max-w-[120px] text-purple-300 font-medium">
                        {noteFolder?.name || 'Sem Pasta'}
                      </span>
                      <span>
                        {new Date(note.updated_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* =========================================================
            COLUNA 3: AMBIENTE DE ESCRITA & PREVIEW MARKDOWN
        ========================================================= */}
        <main
          className={`flex-1 flex-col bg-[#09090b] overflow-hidden ${
            mobileView === 'editor' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {activeNote ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Top Bar da Nota: Título, Pasta e Ações */}
              <div className="p-3 sm:px-4 py-2.5 border-b border-zinc-800 bg-zinc-950/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  {/* Botão voltar para lista no mobile */}
                  <button
                    type="button"
                    onClick={() => setMobileView('notes')}
                    className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 cursor-pointer"
                    title="Voltar para notas"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="flex-1">
                    <input
                      type="text"
                      value={activeNote.title}
                      onChange={(e) => handleUpdateActiveNote({ title: e.target.value })}
                      placeholder="Título da anotação..."
                      className="w-full bg-transparent text-sm sm:text-base font-bold text-white focus:outline-none placeholder:text-zinc-600 border-b border-transparent focus:border-purple-500/50 pb-0.5 transition-colors"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Seletor de Pasta da Nota */}
                  <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs">
                    <Folder className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <select
                      value={activeNote.folder_id || ''}
                      onChange={(e) =>
                        handleUpdateActiveNote({ folder_id: e.target.value || null })
                      }
                      className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
                    >
                      <option value="" className="bg-zinc-900 text-zinc-300">
                        Sem Pasta
                      </option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id} className="bg-zinc-900 text-zinc-300">
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Modos de Visualização (Segmented Control) */}
                  <div className="hidden sm:flex items-center p-0.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setViewMode('split')}
                      title="Lado a Lado (Editor e Prévia)"
                      className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                        viewMode === 'split'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Columns className="w-3.5 h-3.5" />
                      <span className="hidden lg:inline">Divisão</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('edit')}
                      title="Somente Editor"
                      className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                        viewMode === 'edit'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span className="hidden lg:inline">Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('preview')}
                      title="Somente Visualização Formatada"
                      className={`px-2 py-1 text-xs font-semibold rounded-md transition-colors flex items-center gap-1 cursor-pointer ${
                        viewMode === 'preview'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden lg:inline">Visualizar</span>
                    </button>
                  </div>

                  {/* Ações Rápidas: Copiar, Baixar .md e Deletar */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleCopyMarkdown}
                      title="Copiar texto em Markdown"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      {copiedNote ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadMarkdown}
                      title="Baixar arquivo .md"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteNote(activeNote.id)}
                      title="Excluir anotação"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Barra de Ferramentas de Formatação Markdown */}
              {(viewMode === 'split' || viewMode === 'edit') && (
                <div className="px-3 py-1.5 border-b border-zinc-800 bg-zinc-950/40 flex items-center gap-1 overflow-x-auto shrink-0 scrollbar-none text-zinc-400">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 px-1 select-none">
                    Formatar:
                  </span>

                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax('**', '**', 'texto negrito')}
                    title="Negrito (**texto**)"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax('*', '*', 'texto itálico')}
                    title="Itálico (*texto*)"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax('\n# ', '\n', 'Título Nível 1')}
                    title="Título H1"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <Heading1 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax('\n## ', '\n', 'Título Nível 2')}
                    title="Título H2"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <Heading2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax('\n### ', '\n', 'Título Nível 3')}
                    title="Título H3"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <Heading3 className="w-3.5 h-3.5" />
                  </button>

                  <div className="w-[1px] h-4 bg-zinc-800 mx-1 shrink-0" />

                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax('\n- ', '', 'Item da lista')}
                    title="Lista com Marcadores"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax('\n1. ', '', 'Primeiro item')}
                    title="Lista Numerada"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <ListOrdered className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax('\n- [ ] ', '', 'Tarefa a realizar')}
                    title="Checklist / Tarefa"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <ListTodo className="w-3.5 h-3.5" />
                  </button>

                  <div className="w-[1px] h-4 bg-zinc-800 mx-1 shrink-0" />

                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax('`', '`', 'código')}
                    title="Código Inline"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <Code className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      insertMarkdownSyntax('\n```typescript\n', '\n```\n', '// código aqui')
                    }
                    title="Bloco de Código"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <span className="text-[10px] font-mono font-bold">{'{ }'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax('\n> ', '', 'Citação reflexiva')}
                    title="Citação em Bloco"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <Quote className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      insertMarkdownSyntax(
                        '\n| Coluna 1 | Coluna 2 |\n| :--- | :--- |\n| Dado A | Dado B |\n',
                        ''
                      )
                    }
                    title="Inserir Tabela"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax('[', '](https://exemplo.com)', 'Texto do link')}
                    title="Inserir Link"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => insertMarkdownSyntax('\n---\n', '')}
                    title="Divisor Horizontal"
                    className="p-1.5 rounded hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Corpo Principal: Editor e/ou Preview */}
              <div className="flex-1 flex overflow-hidden">
                {/* Painel do Editor */}
                {(viewMode === 'split' || viewMode === 'edit') && (
                  <div
                    className={`h-full flex flex-col ${
                      viewMode === 'split' ? 'w-full lg:w-1/2 border-r border-zinc-800' : 'w-full'
                    }`}
                  >
                    <div className="px-4 py-1.5 border-b border-zinc-800/80 bg-zinc-950/40 text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
                      <span className="uppercase tracking-wider">Editor Markdown</span>
                      <span className="font-mono text-[10px] text-zinc-400">Suporta sintaxe GFM</span>
                    </div>

                    <textarea
                      ref={textareaRef}
                      value={activeNote.content}
                      onChange={(e) => handleUpdateActiveNote({ content: e.target.value })}
                      placeholder="Escreva suas anotações em Markdown..."
                      className="flex-1 w-full p-4 sm:p-5 bg-[#09090b] text-zinc-200 font-mono text-xs sm:text-sm leading-relaxed resize-none focus:outline-none placeholder:text-zinc-600 overflow-y-auto"
                    />
                  </div>
                )}

                {/* Painel do Preview Formatado */}
                {(viewMode === 'split' || viewMode === 'preview') && (
                  <div
                    className={`h-full flex flex-col ${
                      viewMode === 'split' ? 'hidden lg:flex lg:w-1/2' : 'w-full'
                    }`}
                  >
                    <div className="px-4 py-1.5 border-b border-zinc-800/80 bg-zinc-950/40 text-[11px] font-semibold text-zinc-400 flex items-center justify-between">
                      <span className="uppercase tracking-wider">Visualização Formatada</span>
                      <span className="font-mono text-[10px] text-purple-400">Renderização ao vivo</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#09090b]/80">
                      <div className="max-w-3xl mx-auto prose prose-invert prose-zinc prose-headings:font-bold prose-h1:text-2xl prose-h1:border-b prose-h1:border-zinc-800 prose-h1:pb-2 prose-h2:text-xl prose-h2:border-b prose-h2:border-zinc-800/60 prose-h2:pb-1 prose-h3:text-lg prose-h3:text-purple-300 prose-p:text-zinc-300 prose-p:leading-relaxed prose-code:text-purple-300 prose-code:bg-zinc-800/80 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:border prose-code:border-zinc-700/60 prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800 prose-blockquote:border-l-4 prose-blockquote:border-purple-500 prose-blockquote:bg-purple-950/20 prose-blockquote:text-zinc-200 prose-table:border-collapse prose-th:border prose-th:border-zinc-700 prose-th:bg-zinc-800/60 prose-th:p-2 prose-td:border prose-td:border-zinc-800 prose-td:p-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {activeNote.content || '_Nenhum conteúdo para visualizar ainda._'}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Rodapé de Estatísticas: Caracteres, Palavras, Tempo estimado de leitura */}
              <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-950 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400 shrink-0">
                <div className="flex items-center gap-3">
                  <span>
                    Pasta: <strong className="text-zinc-200">{activeFolderName}</strong>
                  </span>
                  <span className="text-zinc-700">·</span>
                  <span>{stats.words} palavras</span>
                  <span className="text-zinc-700">·</span>
                  <span>{stats.characters} caracteres</span>
                  <span className="text-zinc-700">·</span>
                  <span>~{stats.readTimeMinutes} min de leitura</span>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                  <Clock className="w-3 h-3 text-zinc-400" />
                  <span>
                    Atualizado em{' '}
                    {new Date(activeNote.updated_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <FilePlus2 className="w-12 h-12 text-zinc-600 mb-3" />
              <h3 className="text-sm font-bold text-zinc-200 mb-1">Nenhuma anotação selecionada</h3>
              <p className="text-xs text-zinc-400 max-w-sm mb-4">
                Selecione uma anotação na coluna lateral ou crie uma nova para escrever em Markdown.
              </p>
              <button
                type="button"
                onClick={handleCreateNote}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Criar Primeira Anotação
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
