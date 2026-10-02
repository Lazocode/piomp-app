'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  FileText,
  UploadCloud,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Brain,
  BookOpen,
  HelpCircle,
  Send,
  Sparkles,
  Folder,
  Calendar,
  Eye,
  EyeOff,
  MessageSquare,
  Bot,
  User,
  ArrowRight,
  AlertCircle,
  LogOut,
  Lock,
  Lightbulb,
  FilePlus2,
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import NotesWorkspace from './components/NotesWorkspace';

interface TagRelation {
  tags: { name: string } | null;
}

interface DocumentItem {
  id: string;
  title: string;
  file_url: string;
  file_size?: number;
  ai_summary: string;
  created_at: string;
  folders?: { name: string } | null;
  document_tags?: TagRelation[];
}

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

type StudyMode = 'socratico' | 'explicativo' | 'quiz';
type ActiveTab = 'files' | 'doc' | 'chat';

const STUDY_MODES_CONFIG: Record<
  StudyMode,
  { title: string; role: string; description: string; icon: typeof Brain }
> = {
  socratico: {
    title: 'Socrático',
    role: 'Tech Lead / Tutor',
    description:
      'Estimula seu raciocínio crítico apontando pontos cegos e devolvendo perguntas reflexivas.',
    icon: Brain,
  },
  explicativo: {
    title: 'Explicativo',
    role: 'Professor Sênior',
    description:
      'Didático e direto ao ponto. Traduz conceitos complexos com analogias claras e exemplos práticos.',
    icon: BookOpen,
  },
  quiz: {
    title: 'Quiz Técnico',
    role: 'Examinador Sênior',
    description:
      'Simula provas e entrevistas elaborando questões arquiteturais e avaliando suas respostas.',
    icon: HelpCircle,
  },
};

const QUICK_PROMPTS: Record<StudyMode, string[]> = {
  socratico: [
    'Quais as premissas centrais deste documento?',
    'Aponte um trade-off crítico do padrão apresentado.',
    'Como você desafiaria meu entendimento deste tema?',
  ],
  explicativo: [
    'Explique os conceitos centrais com um exemplo prático.',
    'Quais são os principais erros cometidos ao aplicar isso?',
    'Resuma os 3 pontos mais relevantes para o mercado.',
  ],
  quiz: [
    'Gere 1 questão técnica desafiadora sobre o PDF.',
    'Proponha um cenário de decisão arquitetural para eu resolver.',
    'Simule uma pergunta típica de entrevista sobre este tema.',
  ],
};

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function HomePage() {
  const { user, loading: authLoading, logout } = useAuth();

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [studyMode, setStudyMode] = useState<StudyMode>('socratico');
  const [loadingChat, setLoadingChat] = useState(false);

  // Módulo ativo: 'study' (Estudos e PDFs) ou 'notes' (Ambiente de Anotações Markdown)
  const [activeModule, setActiveModule] = useState<'study' | 'notes'>('study');
  const [noteDraft, setNoteDraft] = useState<{
    title: string;
    content: string;
    folderName?: string;
  } | null>(null);

  // Aba ativa para telas menores (< lg)
  const [activeTab, setActiveTab] = useState<ActiveTab>('files');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [docToDeleteConfirm, setDocToDeleteConfirm] = useState<DocumentItem | null>(null);

  function triggerNotification(message: string, type: 'success' | 'error' = 'error') {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  }

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filtro de documentos em tempo real
  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const term = searchQuery.toLowerCase().trim();
    return documents.filter((doc) => {
      const matchesTitle = doc.title.toLowerCase().includes(term);
      const matchesFolder = doc.folders?.name?.toLowerCase().includes(term);
      const matchesTags = doc.document_tags?.some((dt) =>
        dt.tags?.name?.toLowerCase().includes(term)
      );
      return Boolean(matchesTitle || matchesFolder || matchesTags);
    });
  }, [documents, searchQuery]);

  async function refreshDocuments() {
    const { data } = await supabase
      .from('documents')
      .select('*, folders(name), document_tags(tags(name))')
      .order('created_at', { ascending: false });

    if (data) setDocuments(data as DocumentItem[]);
  }

  useEffect(() => {
    if (!user) return;
    async function loadInitialDocs() {
      const { data } = await supabase
        .from('documents')
        .select('*, folders(name), document_tags(tags(name))')
        .order('created_at', { ascending: false });

      if (data) {
        const docs = data as DocumentItem[];
        setDocuments(docs);
        if (docs.length > 0) setSelectedDoc(docs[0]);
      }
    }
    loadInitialDocs();
  }, [user]);

  useEffect(() => {
    if (!selectedDoc) return;
    const docId = selectedDoc.id;

    async function loadHistory() {
      const { data } = await supabase
        .from('study_messages')
        .select('role, content')
        .eq('document_id', docId)
        .order('created_at', { ascending: true });

      if (data) setMessages(data as ChatMessage[]);
    }
    loadHistory();
  }, [selectedDoc]);

  // Scroll automático para a última mensagem
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loadingChat]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Falha no upload');

      await refreshDocuments();
      setSelectedDoc(data.document);
      setActiveTab('doc'); // Redireciona para o resumo em telas menores
      triggerNotification('Documento enviado e indexado com sucesso!', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado no envio';
      triggerNotification(msg, 'error');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function requestDeleteDocument(docToDelete: DocumentItem, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setDocToDeleteConfirm(docToDelete);
  }

  async function executeDeleteDocument() {
    if (!docToDeleteConfirm) return;
    const docToDelete = docToDeleteConfirm;
    setDocToDeleteConfirm(null);
    setDeletingId(docToDelete.id);

    try {
      const urlParts = docToDelete.file_url.split('/pdfs/');
      if (urlParts.length > 1) {
        const storagePath = decodeURIComponent(urlParts[1]);
        await supabase.storage.from('pdfs').remove([storagePath]);
      }

      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', docToDelete.id);

      if (error) throw new Error(error.message);

      const updatedDocs = documents.filter((d) => d.id !== docToDelete.id);
      setDocuments(updatedDocs);

      if (selectedDoc?.id === docToDelete.id) {
        const nextDoc = updatedDocs.length > 0 ? updatedDocs[0] : null;
        setSelectedDoc(nextDoc);
        if (!nextDoc) setMessages([]);
      }
      triggerNotification(`Documento "${docToDelete.title}" excluído com sucesso.`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover PDF';
      triggerNotification(msg, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSendMessage(e?: React.FormEvent, customMsg?: string) {
    if (e) e.preventDefault();
    const textToSend = customMsg || inputMsg;
    if (!textToSend.trim() || !selectedDoc || loadingChat) return;

    setInputMsg('');
    setMessages((prev) => [...prev, { role: 'user', content: textToSend }]);
    setLoadingChat(true);

    try {
      const res = await fetch('/api/study/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: selectedDoc.id,
          message: textToSend,
          study_mode: studyMode,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Erro na requisição');

      setMessages((prev) => [...prev, { role: 'model', content: data.reply }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado na conversa';
      triggerNotification(msg, 'error');
    } finally {
      setLoadingChat(false);
    }
  }

  function handleCopySummary() {
    if (!selectedDoc?.ai_summary) return;
    navigator.clipboard.writeText(selectedDoc.ai_summary);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  }

  const activeTags =
    selectedDoc?.document_tags?.map((t) => t.tags?.name).filter(Boolean) || [];

  if (authLoading) {
    return (
      <div className="min-h-dvh w-full bg-[#09090b] flex flex-col items-center justify-center text-zinc-400">
        <div className="w-9 h-9 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mb-3" />
        <span className="text-xs sm:text-sm font-semibold text-zinc-300">
          Carregando ambiente seguro...
        </span>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-dvh lg:h-dvh w-full bg-[#09090b] text-zinc-100 flex flex-col font-sans overflow-x-hidden lg:overflow-hidden text-base">
      
      {/* =========================================================
          BARRA SUPERIOR (HEADER RESPONSIVO COM STATUS DE AUTENTICAÇÃO)
      ========================================================= */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-bold text-base sm:text-lg tracking-tight text-white shrink-0">
              PoimpStudy
            </span>

            <span className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/50 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300 shrink-0">
              <Lock className="w-3 h-3 text-emerald-400" />
              <span>Vault</span>
            </span>
          </div>

          {/* Seletor de Módulo: Estudos & PDFs vs Caderno de Anotações */}
          <div className="flex items-center p-0.5 sm:p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveModule('study')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeModule === 'study'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Estudos & PDFs</span>
              <span className="sm:hidden">PDFs</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModule('notes')}
              className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeModule === 'notes'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Anotações</span>
            </button>
          </div>

          {activeModule === 'study' && selectedDoc && (
            <span className="hidden 2xl:inline-flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-full px-2.5 py-0.5 max-w-[200px] truncate">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="truncate">{selectedDoc.title}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {activeModule === 'study' ? (
            <label className="cursor-pointer inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-sm shadow-purple-900/40">
              <UploadCloud className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Adicionar PDF</span>
              <span className="sm:hidden">PDF</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNoteDraft({
                  title: 'Nova Anotação',
                  content: '# Nova Anotação\n\nComece a escrever em Markdown aqui...',
                });
              }}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-sm shadow-purple-900/40 cursor-pointer"
            >
              <FilePlus2 className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Nova Anotação</span>
              <span className="sm:hidden">Nota</span>
            </button>
          )}

          {/* Perfil Autenticado & Botão Sair com Proteção */}
          <div className="flex items-center gap-1.5 pl-1.5 sm:pl-2 border-l border-zinc-800">
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
              <User className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-zinc-300 font-medium max-w-[110px] truncate" title={user.email}>
                {user.name || user.email.split('@')[0]}
              </span>
            </div>

            <button
              type="button"
              onClick={async () => {
                await logout();
                triggerNotification('Você encerrou a sessão com segurança.', 'success');
              }}
              title="Encerrar sessão"
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-zinc-900 hover:bg-red-500/15 text-zinc-400 hover:text-red-400 border border-zinc-800 transition-all text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* =========================================================
          MÓDULO ATIVO: AMBIENTE DE ANOTAÇÕES MARKDOWN OU ESTUDOS & PDFS
      ========================================================= */}
      {activeModule === 'notes' ? (
        <NotesWorkspace
          userId={user.id}
          initialNoteDraft={noteDraft}
          onClearDraft={() => setNoteDraft(null)}
        />
      ) : (
        <>
          {/* =========================================================
              NAVEGAÇÃO DE ABAS PARA TELAS PEQUENAS E MÉDIAS (< LG)
          ========================================================= */}
          <nav className="lg:hidden p-2 sm:p-3 pb-0 shrink-0">
        <div className="grid grid-cols-3 gap-1 bg-zinc-950/90 border border-zinc-800 rounded-xl p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 min-h-[42px] ${
              activeTab === 'files'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Folder className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Arquivos ({filteredDocuments.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('doc')}
            className={`py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 min-h-[42px] ${
              activeTab === 'doc'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Resumo</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`py-2 px-2 sm:px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 min-h-[42px] ${
              activeTab === 'chat'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            <Brain className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Estudo</span>
          </button>
        </div>
      </nav>

      {/* =========================================================
          DISPOSIÇÃO PRINCIPAL: 3 COLUNAS RESPONSIVAS
      ========================================================= */}
      <div className="flex-1 p-2 sm:p-3 md:p-4 overflow-hidden flex flex-col lg:grid lg:grid-cols-12 gap-3 sm:gap-4 max-w-[1920px] w-full mx-auto">
        
        {/* =========================================================
            COLUNA 1: ARQUIVOS (ESQUERDA - 4 COLUNAS EM LG / 3 EM XL)
        ========================================================= */}
        <section
          className={`col-span-12 lg:col-span-4 xl:col-span-3 flex-col h-[calc(100dvh-7.8rem)] sm:h-[calc(100dvh-8.5rem)] lg:h-full overflow-hidden bg-zinc-900/60 border border-zinc-800 rounded-2xl shadow-sm ${
            activeTab === 'files' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Header da Coluna 1 */}
          <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-950/60">
            <div className="flex items-center gap-2">
              <span className="w-2 h-4 bg-purple-500 rounded-full shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-zinc-100 uppercase tracking-wide">
                01. Repositório
              </span>
            </div>
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-200">
              {filteredDocuments.length}
              {searchQuery ? ` / ${documents.length}` : ''}
            </span>
          </div>

          <div className="p-3 sm:p-3.5 flex flex-col gap-2.5 sm:gap-3 flex-1 overflow-hidden min-h-0">
            {/* Campo de Busca */}
            <div className="relative flex items-center shrink-0">
              <Search className="w-4 h-4 absolute left-3 text-zinc-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por título ou tag..."
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl text-xs sm:text-sm text-zinc-100 pl-9 pr-8 py-2 sm:py-2.5 placeholder:text-zinc-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40 transition-all font-medium"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Limpar busca"
                  className="absolute right-2.5 p-1 text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Botão de Upload com Destaque */}
            <label
              className={`w-full py-2 sm:py-2.5 px-3 border border-dashed rounded-xl text-xs sm:text-sm font-semibold text-center cursor-pointer transition-all flex items-center justify-center gap-2 shrink-0 ${
                uploading
                  ? 'bg-purple-950/40 border-purple-500 text-purple-200 animate-pulse'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:border-purple-500 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <UploadCloud className="w-4 h-4 text-purple-400 shrink-0" />
              <span>{uploading ? 'Processando e analisando...' : 'Fazer Upload de Novo PDF'}</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>

            {/* Grid de Documentos com Quebra Responsiva */}
            <div className="flex-1 overflow-y-auto pr-1">
              {filteredDocuments.length === 0 ? (
                <div className="h-full min-h-[160px] flex flex-col items-center justify-center text-center p-4 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30">
                  <FileText className="w-8 h-8 text-zinc-500 mb-2" />
                  <p className="text-sm font-semibold text-zinc-200 mb-1">
                    Nenhum documento encontrado
                  </p>
                  {searchQuery ? (
                    <>
                      <p className="text-xs text-zinc-400 max-w-[200px] truncate mb-3">
                        Termo: &quot;{searchQuery}&quot;
                      </p>
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                      >
                        Limpar filtro
                      </button>
                    </>
                  ) : (
                    <p className="text-xs text-zinc-400">
                      Adicione um arquivo PDF acima para começar seus estudos.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-1 gap-2.5">
                  {filteredDocuments.map((doc, idx) => {
                    const isSelected = selectedDoc?.id === doc.id;
                    const isDeleting = deletingId === doc.id;
                    const folder = doc.folders?.name || 'Geral';

                    return (
                      <div
                        key={doc.id}
                        onClick={() => {
                          setSelectedDoc(doc);
                          setActiveTab('doc');
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedDoc(doc);
                            setActiveTab('doc');
                          }
                        }}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer relative group ${
                          isSelected
                            ? 'bg-purple-950/40 border-purple-500 shadow-md shadow-purple-950/50 ring-1 ring-purple-500/50 text-white'
                            : 'bg-zinc-950/80 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900 text-zinc-200'
                        } ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
                      >
                        {/* Linha superior do card */}
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <div className="flex items-center gap-1.5 truncate min-w-0">
                            <span
                              className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                isSelected
                                  ? 'bg-purple-500/30 text-purple-200'
                                  : 'bg-zinc-800 text-zinc-300'
                              }`}
                            >
                              #{String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-wide text-purple-300 truncate">
                              {folder}
                            </span>
                          </div>

                          <button
                            type="button"
                            title="Remover documento"
                            onClick={(e) => requestDeleteDocument(doc, e)}
                            className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Título do PDF */}
                        <p className="text-xs sm:text-sm font-semibold line-clamp-2 leading-snug mb-2 group-hover:text-purple-200 transition-colors text-zinc-100">
                          {doc.title}
                        </p>

                        {/* Tags Técnicas */}
                        {doc.document_tags && doc.document_tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2.5">
                            {doc.document_tags.slice(0, 3).map((t, tIdx) => {
                              const tagName = t.tags?.name;
                              if (!tagName) return null;
                              const isTagMatch =
                                searchQuery &&
                                tagName.toLowerCase().includes(searchQuery.toLowerCase().trim());
                              return (
                                <span
                                  key={tIdx}
                                  className={`text-xs font-medium px-2 py-0.5 rounded-md truncate max-w-[120px] ${
                                    isTagMatch
                                      ? 'bg-purple-900 text-purple-100 border border-purple-400 font-bold'
                                      : 'bg-zinc-800/90 border border-zinc-700/80 text-zinc-300'
                                  }`}
                                >
                                  #{tagName}
                                </span>
                              );
                            })}
                            {doc.document_tags.length > 3 && (
                              <span className="text-xs font-medium text-zinc-400 self-center">
                                +{doc.document_tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Rodapé do card: tamanho e status */}
                        <div className="flex items-center justify-between text-xs font-medium text-zinc-400 pt-2 border-t border-zinc-800">
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span className={`text-xs font-semibold ${isSelected ? 'text-purple-300' : 'text-zinc-500'}`}>
                            {isSelected ? 'Selecionado' : 'Abrir'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* =========================================================
            COLUNA 2: ESTRUTURA E RESUMO (CENTRO - 4 COLUNAS EM LG / 5 EM XL)
        ========================================================= */}
        <section
          className={`col-span-12 lg:col-span-4 xl:col-span-5 flex-col h-[calc(100dvh-7.8rem)] sm:h-[calc(100dvh-8.5rem)] lg:h-full overflow-hidden bg-zinc-900/60 border border-zinc-800 rounded-2xl shadow-sm ${
            activeTab === 'doc' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Header da Coluna 2 */}
          <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-950/60">
            <div className="flex items-center gap-2">
              <span className="w-2 h-4 bg-indigo-500 rounded-full shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-zinc-100 uppercase tracking-wide">
                02. Análise & Síntese
              </span>
            </div>

            {selectedDoc && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setShowPdfPreview(!showPdfPreview)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-all ${
                    showPdfPreview
                      ? 'bg-purple-600 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                  }`}
                  title="Alternar pré-visualização do PDF"
                >
                  {showPdfPreview ? <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                  <span>{showPdfPreview ? 'Ocultar' : 'Ver PDF'}</span>
                </button>

                <a
                  href={selectedDoc.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 sm:px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-lg text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-all"
                  title="Abrir arquivo PDF original em nova aba"
                >
                  <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Abrir</span>
                </a>

                <button
                  type="button"
                  onClick={() => requestDeleteDocument(selectedDoc)}
                  disabled={deletingId === selectedDoc.id}
                  className="p-1.5 bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 rounded-lg transition-all"
                  title="Excluir documento"
                >
                  <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="p-3 sm:p-4 flex flex-col gap-3 sm:gap-3.5 flex-1 overflow-y-auto min-h-0">
            {selectedDoc ? (
              <>
                {/* Visualizador de PDF Opcional */}
                {showPdfPreview && (
                  <div className="border border-zinc-700 rounded-xl overflow-hidden bg-zinc-950 h-60 sm:h-72 shrink-0 flex flex-col">
                    <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-xs font-medium text-zinc-300 flex items-center justify-between">
                      <span>Visualizador Embutido</span>
                      <a
                        href={selectedDoc.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-400 hover:underline flex items-center gap-1"
                      >
                        Tela cheia <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <iframe
                      src={selectedDoc.file_url}
                      className="w-full flex-1 border-0"
                      title={selectedDoc.title}
                    />
                  </div>
                )}

                {/* Card de Título e Metadados Principais */}
                <div className="p-3.5 sm:p-5 rounded-xl bg-zinc-950 border border-zinc-800 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 sm:mb-2.5">
                    <span className="text-xs font-semibold px-2.5 py-0.5 sm:py-1 rounded-full bg-purple-500/20 text-purple-200 border border-purple-500/30 uppercase tracking-wide">
                      {selectedDoc.folders?.name || 'Geral'}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-zinc-600 inline-block" />
                    <span className="text-xs font-semibold text-zinc-300 font-mono">
                      {formatFileSize(selectedDoc.file_size)}
                    </span>
                  </div>

                  <h2 className="text-base sm:text-lg font-bold text-white leading-snug break-words">
                    {selectedDoc.title}
                  </h2>

                  {activeTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3 pt-3 border-t border-zinc-800">
                      {activeTags.map((tag, i) => (
                        <span
                          key={i}
                          className="text-xs font-medium px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Grade de Estatísticas */}
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="p-3 sm:p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-semibold mb-1">
                      <Folder className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400 shrink-0" />
                      <span>CATEGORIA</span>
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-purple-200 uppercase truncate block">
                      {selectedDoc.folders?.name || 'Geral'}
                    </span>
                  </div>

                  <div className="p-3 sm:p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-semibold mb-1">
                      <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400 shrink-0" />
                      <span>INDEXAÇÃO</span>
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-zinc-200 block truncate">
                      {new Date(selectedDoc.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {/* Card de Síntese */}
                <div className="flex-1 flex flex-col rounded-xl bg-zinc-950 border border-zinc-800 overflow-hidden shadow-sm min-h-[180px]">
                  <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-white min-w-0">
                      <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                      <span className="truncate">Síntese Executiva Gerada por IA</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setNoteDraft({
                            title: `Resumo: ${selectedDoc.title.replace(/\.pdf$/i, '')}`,
                            content: `# ${selectedDoc.title}\n\n**Categoria:** ${selectedDoc.folders?.name || 'Geral'}\n**Indexado em:** ${new Date(selectedDoc.created_at).toLocaleDateString('pt-BR')}\n\n---\n\n## Síntese do Documento\n\n${selectedDoc.ai_summary}\n\n---\n\n## Anotações Complementares\n\n- [ ] Revisar conceitos-chave\n- [ ] Praticar tópicos abordados\n`,
                            folderName: 'Resumos de Leitura',
                          });
                          setActiveModule('notes');
                          triggerNotification('Resumo enviado para o Caderno de Anotações.', 'success');
                        }}
                        className="text-xs font-semibold text-purple-300 hover:text-white flex items-center gap-1.5 transition-colors px-2.5 py-1 rounded-md hover:bg-purple-950/70 border border-purple-800/60 shrink-0 cursor-pointer"
                        title="Criar anotação em Markdown com este resumo"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Criar Anotação</span>
                        <span className="sm:hidden">Anotar</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCopySummary}
                        className="text-xs sm:text-sm font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition-colors px-2.5 py-1 rounded-md hover:bg-zinc-800 shrink-0 cursor-pointer"
                        title="Copiar resumo"
                      >
                        {copiedSummary ? (
                          <>
                            <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
                            <span className="text-emerald-400">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 sm:p-5 flex-1 overflow-y-auto">
                    <p className="text-sm sm:text-base text-zinc-100 leading-relaxed whitespace-pre-wrap font-sans font-normal selection:bg-purple-500/40">
                      {selectedDoc.ai_summary}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-400 border border-dashed border-zinc-800 rounded-xl">
                <FileText className="w-10 h-10 text-zinc-500 mb-2.5" />
                <p className="text-sm font-bold text-zinc-200">Nenhum documento selecionado</p>
                <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                  Selecione um arquivo da lista para inspecionar seu resumo e metadados.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* =========================================================
            COLUNA 3: TERMINAL DE ESTUDO (DIREITA - 4 COLUNAS EM LG/XL)
        ========================================================= */}
        <section
          className={`col-span-12 lg:col-span-4 xl:col-span-4 flex-col h-[calc(100dvh-7.8rem)] sm:h-[calc(100dvh-8.5rem)] lg:h-full overflow-hidden bg-zinc-900/60 border border-zinc-800 rounded-2xl shadow-sm ${
            activeTab === 'chat' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Header da Coluna 3 */}
          <div className="px-3.5 sm:px-4 py-2.5 sm:py-3 border-b border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-950/60">
            <div className="flex items-center gap-2">
              <span className="w-2 h-4 bg-purple-500 rounded-full shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-zinc-100 uppercase tracking-wide">
                03. Tutor de Estudos IA
              </span>
            </div>
          </div>

          <div className="p-3 sm:p-3.5 flex flex-col gap-2.5 sm:gap-3 flex-1 overflow-hidden min-h-0">
            
            {/* Seletor de Modo de Estudo */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 shrink-0">
              {(['socratico', 'explicativo', 'quiz'] as const).map((mode) => {
                const active = studyMode === mode;
                const info = STUDY_MODES_CONFIG[mode];

                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setStudyMode(mode)}
                    className={`p-2 sm:p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      active
                        ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-900/40'
                        : 'bg-zinc-950 border-zinc-700/80 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-900 hover:text-white'
                    }`}
                  >
                    <span className="text-xs sm:text-sm font-bold tracking-tight block mb-0.5 truncate">
                      {info.title}
                    </span>
                    <span
                      className={`text-[11px] sm:text-xs font-semibold truncate ${
                        active ? 'text-purple-100' : 'text-zinc-400'
                      }`}
                    >
                      {info.role}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Descrição Didática */}
            <div className="px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-800 flex items-start gap-2 shrink-0">
              <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 shrink-0" />
              <p className="text-xs sm:text-sm text-zinc-200 leading-snug">
                <span className="font-bold text-purple-300">
                  {STUDY_MODES_CONFIG[studyMode].title}:
                </span>{' '}
                {STUDY_MODES_CONFIG[studyMode].description}
              </p>
            </div>

            {/* Mensagens do Chat */}
            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl p-3 sm:p-3.5 overflow-y-auto space-y-3 min-h-0">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 sm:p-6 text-zinc-400">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-2">
                    <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <p className="text-sm font-bold text-zinc-200">Workspace de Estudo Pronto</p>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1 max-w-[280px]">
                    Envie uma dúvida sobre o PDF ou clique em uma das sugestões abaixo para iniciar.
                  </p>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isUser = m.role === 'user';
                  return (
                    <div
                      key={idx}
                      className={`flex gap-2 sm:gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isUser && (
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0 mt-0.5">
                          <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                      )}

                      <div
                        className={`max-w-[88%] sm:max-w-[85%] rounded-2xl p-3 sm:p-3.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? 'bg-purple-600 text-white rounded-tr-xs shadow-md shadow-purple-950/50'
                            : 'bg-zinc-900 border border-zinc-700/80 text-zinc-100 rounded-tl-xs shadow-sm'
                        }`}
                      >
                        <div
                          className={`text-xs font-bold uppercase mb-1 ${
                            isUser ? 'text-purple-100' : 'text-purple-300'
                          }`}
                        >
                          {isUser ? 'Você' : `Tutor IA // ${STUDY_MODES_CONFIG[studyMode].title}`}
                        </div>
                        {m.content}
                      </div>

                      {isUser && (
                        <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-200 shrink-0 mt-0.5">
                          <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {loadingChat && (
                <div className="flex gap-2 sm:gap-2.5 items-start">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse" />
                  </div>
                  <div className="bg-zinc-900 border border-zinc-700/80 text-purple-200 rounded-2xl rounded-tl-xs p-3 sm:p-3.5 text-xs sm:text-sm flex items-center gap-2 font-medium">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                    <span>Gemini analisando contexto e formulando resposta...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Sugestões de Perguntas Rápidas */}
            <div className="space-y-1 shrink-0">
              <span className="text-xs font-semibold text-zinc-400 px-1 block">
                SUGESTÕES:
              </span>
              <div className="flex flex-wrap gap-1.5 max-h-20 sm:max-h-24 overflow-y-auto">
                {QUICK_PROMPTS[studyMode].map((prompt, pIdx) => (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => {
                      setInputMsg(prompt);
                      inputRef.current?.focus();
                    }}
                    className="text-xs font-medium text-zinc-200 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 transition-all text-left truncate max-w-full inline-flex items-center gap-1.5"
                  >
                    <Lightbulb className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="truncate">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Formulário de Envio */}
            <form onSubmit={(e) => handleSendMessage(e)} className="shrink-0">
              <div className="relative flex items-center bg-zinc-950 border border-zinc-700 rounded-xl p-1 sm:p-1.5 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500/40 transition-all">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  disabled={!selectedDoc || loadingChat}
                  placeholder={
                    selectedDoc
                      ? 'Faça uma pergunta sobre o documento...'
                      : 'Selecione um PDF antes de interagir...'
                  }
                  className="w-full bg-transparent text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-400 px-2.5 sm:px-3 py-2 focus:outline-none font-medium"
                />
                <button
                  type="submit"
                  disabled={!selectedDoc || loadingChat || !inputMsg.trim()}
                  className="p-2 sm:p-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-sm shadow-purple-900/40 font-semibold"
                  title="Enviar mensagem"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>

          </div>
        </section>
      </div>
      </>
    )}

      {/* =========================================================
          FEEDBACK VISUAL: TOAST DE NOTIFICAÇÃO (SEM ALERT BLOQUEANTE)
      ========================================================= */}
      {notification && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 max-w-sm sm:max-w-md p-3.5 rounded-xl border shadow-xl flex items-center justify-between gap-3 text-xs sm:text-sm font-medium transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/70 text-emerald-200'
              : 'bg-red-950/95 border-red-500/70 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="p-1 hover:opacity-75 transition-opacity"
            title="Fechar"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* =========================================================
          MODAL DE CONFIRMAÇÃO DE EXCLUSÃO (SEM WINDOW.CONFIRM)
      ========================================================= */}
      {docToDeleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-5 max-w-md w-full shadow-2xl text-left">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>Remover documento?</span>
            </h3>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed mb-4">
              Deseja remover permanentemente o arquivo &quot;
              <span className="text-white font-semibold">{docToDeleteConfirm.title}</span>
              &quot; e todo o histórico de estudo associado?
            </p>
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDocToDeleteConfirm(null)}
                className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDeleteDocument}
                className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs sm:text-sm font-semibold transition-colors shadow-sm cursor-pointer"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
