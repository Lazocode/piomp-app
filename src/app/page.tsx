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
  Layers,
  ArrowRight,
} from 'lucide-react';
import { supabase } from './lib/supabase';

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
  { title: string; role: string; description: string; icon: typeof Brain; badgeColor: string }
> = {
  socratico: {
    title: 'Socrático',
    role: 'Tech Lead / Tutor',
    description:
      'Estimula seu raciocínio crítico apontando pontos cegos e devolvendo perguntas reflexivas.',
    icon: Brain,
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  explicativo: {
    title: 'Explicativo',
    role: 'Professor Sênior',
    description:
      'Didático e direto. Traduz conceitos complexos com analogias claras e exemplos de mercado.',
    icon: BookOpen,
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  },
  quiz: {
    title: 'Quiz Técnico',
    role: 'Examinador Sênior',
    description:
      'Simula provas e entrevistas elaborando questões arquiteturais e avaliando suas respostas.',
    icon: HelpCircle,
    badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
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
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [studyMode, setStudyMode] = useState<StudyMode>('socratico');
  const [loadingChat, setLoadingChat] = useState(false);

  // Aba ativa para ecrãs menores (< xl)
  const [activeTab, setActiveTab] = useState<ActiveTab>('files');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [showPdfPreview, setShowPdfPreview] = useState(false);

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
  }, []);

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
      setActiveTab('doc'); // Redireciona para o resumo no telemóvel
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      alert(msg);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleDeleteDocument(docToDelete: DocumentItem, e?: React.MouseEvent) {
    if (e) e.stopPropagation();

    const confirmed = window.confirm(
      `Deseja remover permanentemente o arquivo "${docToDelete.title}" e todo o histórico de estudo?`
    );
    if (!confirmed) return;

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover PDF';
      alert(msg);
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
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      alert(msg);
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

  const CurrentModeIcon = STUDY_MODES_CONFIG[studyMode].icon;

  return (
    <div className="min-h-screen xl:h-screen w-screen bg-[#09090b] text-zinc-100 flex flex-col font-sans overflow-x-hidden xl:overflow-hidden">
      
      {/* =========================================================
          BARRA SUPERIOR (HEADER MODERNO)
      ========================================================= */}
      <header className="h-14 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm tracking-tight text-zinc-100">
              PoimpStudy
            </span>
          </div>
        </div>

        {/* Contador e Ação Rápida */}
        <div className="flex items-center gap-3">
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-medium transition-all shadow-sm shadow-purple-900/40">
            <UploadCloud className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Adicionar PDF</span>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      </header>

      {/* =========================================================
          NAVEGAÇÃO DE ABAS MÓVEL (< XL)
      ========================================================= */}
      <nav className="xl:hidden grid grid-cols-3 gap-1 bg-zinc-950/90 border-b border-zinc-800/80 p-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('files')}
          className={`py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'files'
              ? 'bg-purple-600/90 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
          }`}
        >
          <Folder className="w-3.5 h-3.5" />
          <span>Arquivos ({filteredDocuments.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('doc')}
          className={`py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'doc'
              ? 'bg-purple-600/90 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Resumo</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={`py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'chat'
              ? 'bg-purple-600/90 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
          }`}
        >
          <Brain className="w-3.5 h-3.5" />
          <span>Estudo</span>
        </button>
      </nav>

      {/* =========================================================
          DISPOSIÇÃO PRINCIPAL: 3 COLUNAS (LAYOUT DO TEMPLATE PRESERVADO)
      ========================================================= */}
      <div className="flex-1 p-3 sm:p-4 overflow-hidden flex flex-col xl:grid xl:grid-cols-12 gap-3.5 max-w-[1920px] w-full mx-auto">
        
        {/* =========================================================
            COLUNA 1: ARQUIVOS (ESQUERDA - 3 COLUNAS)
        ========================================================= */}
        <section
          className={`col-span-12 xl:col-span-3 flex-col h-full overflow-hidden bg-zinc-900/40 border border-zinc-800/80 rounded-2xl backdrop-blur-md shadow-sm ${
            activeTab === 'files' ? 'flex' : 'hidden xl:flex'
          }`}
        >
          {/* Header da Coluna 1 */}
          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between shrink-0 bg-zinc-950/40">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-3.5 bg-purple-500 rounded-full" />
              <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                01. Repositório
              </span>
            </div>
            <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
              {filteredDocuments.length}
              {searchQuery ? ` / ${documents.length}` : ''}
            </span>
          </div>

          <div className="p-3 sm:p-3.5 flex flex-col gap-3 flex-1 overflow-hidden min-h-[400px] xl:min-h-0">
            {/* Campo de Busca Moderno */}
            <div className="relative flex items-center shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-3 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por título ou tag..."
                className="w-full bg-zinc-950/70 border border-zinc-800 rounded-xl text-xs text-zinc-200 pl-8.5 pr-8 py-2 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Limpar busca"
                  className="absolute right-2.5 p-0.5 text-zinc-500 hover:text-zinc-200 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Botão de Upload com Destaque */}
            <label
              className={`w-full py-2 px-3 border border-dashed rounded-xl text-xs font-medium text-center cursor-pointer transition-all flex items-center justify-center gap-2 shrink-0 ${
                uploading
                  ? 'bg-purple-950/30 border-purple-500 text-purple-300 animate-pulse'
                  : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-purple-500/80 hover:bg-zinc-900 hover:text-purple-300'
              }`}
            >
              <UploadCloud className="w-4 h-4 text-purple-400" />
              <span>{uploading ? 'Processando e analisando...' : 'Fazer Upload de Novo PDF'}</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>

            {/* Grid de Documentos */}
            <div className="flex-1 overflow-y-auto pr-1">
              {filteredDocuments.length === 0 ? (
                <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center p-4 border border-dashed border-zinc-800/80 rounded-xl bg-zinc-950/20">
                  <FileText className="w-7 h-7 text-zinc-600 mb-2" />
                  <p className="text-xs font-medium text-zinc-300 mb-1">
                    Nenhum documento encontrado
                  </p>
                  {searchQuery ? (
                    <>
                      <p className="text-[11px] text-zinc-500 max-w-[200px] truncate mb-3">
                        Termo: &quot;{searchQuery}&quot;
                      </p>
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-medium transition-colors"
                      >
                        Limpar filtro
                      </button>
                    </>
                  ) : (
                    <p className="text-[11px] text-zinc-500">
                      Adicione um arquivo PDF acima para começar seus estudos.
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2.5">
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
                            ? 'bg-purple-950/25 border-purple-500/70 shadow-sm shadow-purple-900/20 ring-1 ring-purple-500/30 text-white'
                            : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 hover:bg-zinc-900/60 text-zinc-300'
                        } ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
                      >
                        {/* Linha superior do card */}
                        <div className="flex items-center justify-between gap-1 mb-2">
                          <div className="flex items-center gap-1.5 truncate">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                isSelected
                                  ? 'bg-purple-500/20 text-purple-300'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              #{String(idx + 1).padStart(2, '0')}
                            </span>
                            <span className="text-[10px] font-medium uppercase tracking-wider text-purple-400/90 truncate">
                              {folder}
                            </span>
                          </div>

                          <button
                            type="button"
                            title="Remover documento"
                            onClick={(e) => handleDeleteDocument(doc, e)}
                            className="p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-red-500/10 hover:text-red-400 text-zinc-400 transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Título do PDF */}
                        <p className="text-xs font-semibold line-clamp-2 leading-snug mb-2 group-hover:text-purple-200 transition-colors">
                          {doc.title}
                        </p>

                        {/* Tags Técnicas com Destaque */}
                        {doc.document_tags && doc.document_tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {doc.document_tags.slice(0, 3).map((t, tIdx) => {
                              const tagName = t.tags?.name;
                              if (!tagName) return null;
                              const isTagMatch =
                                searchQuery &&
                                tagName.toLowerCase().includes(searchQuery.toLowerCase().trim());
                              return (
                                <span
                                  key={tIdx}
                                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded truncate max-w-[100px] ${
                                    isTagMatch
                                      ? 'bg-purple-900/80 text-purple-200 border border-purple-500/50 font-bold'
                                      : 'bg-zinc-900 border border-zinc-800/80 text-zinc-400'
                                  }`}
                                >
                                  #{tagName}
                                </span>
                              );
                            })}
                            {doc.document_tags.length > 3 && (
                              <span className="text-[9px] font-mono text-zinc-500 self-center">
                                +{doc.document_tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Rodapé do card: tamanho e indicador */}
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 pt-1.5 border-t border-zinc-800/60">
                          <span>{formatFileSize(doc.file_size)}</span>
                          <span className={`text-[10px] ${isSelected ? 'text-purple-400 font-medium' : 'text-zinc-600'}`}>
                            {isSelected ? 'Em foco' : 'Selecionar'}
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
            COLUNA 2: ESTRUTURA E RESUMO (CENTRO - 5 COLUNAS)
        ========================================================= */}
        <section
          className={`col-span-12 xl:col-span-5 flex-col h-full overflow-hidden bg-zinc-900/40 border border-zinc-800/80 rounded-2xl backdrop-blur-md shadow-sm ${
            activeTab === 'doc' ? 'flex' : 'hidden xl:flex'
          }`}
        >
          {/* Header da Coluna 2 */}
          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between shrink-0 bg-zinc-950/40">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-3.5 bg-indigo-500 rounded-full" />
              <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                02. Análise & Síntese
              </span>
            </div>

            {selectedDoc && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPdfPreview(!showPdfPreview)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                    showPdfPreview
                      ? 'bg-purple-600 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                  }`}
                  title="Alternar pré-visualização do PDF"
                >
                  {showPdfPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">
                    {showPdfPreview ? 'Ocultar PDF' : 'Ver PDF'}
                  </span>
                </button>

                <a
                  href={selectedDoc.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all"
                  title="Abrir arquivo PDF original em nova aba"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Abrir</span>
                </a>

                <button
                  type="button"
                  onClick={() => handleDeleteDocument(selectedDoc)}
                  disabled={deletingId === selectedDoc.id}
                  className="p-1.5 bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-lg transition-all"
                  title="Excluir documento"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="p-3.5 sm:p-4 flex flex-col gap-3.5 flex-1 overflow-y-auto min-h-[450px] xl:min-h-0">
            {selectedDoc ? (
              <>
                {/* Visualizador de PDF Opcional Embutido */}
                {showPdfPreview && (
                  <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950 h-72 shrink-0 flex flex-col">
                    <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-[11px] font-mono text-zinc-400 flex items-center justify-between">
                      <span>Visualizador Embutido</span>
                      <a
                        href={selectedDoc.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-400 hover:underline flex items-center gap-1"
                      >
                        Tela cheia <ArrowRight className="w-3 h-3" />
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
                <div className="p-4 rounded-xl bg-gradient-to-br from-zinc-900/90 to-zinc-950 border border-zinc-800/90 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 uppercase">
                      {selectedDoc.folders?.name || 'Geral'}
                    </span>
                    <span className="text-zinc-600 text-xs">•</span>
                    <span className="text-[11px] font-mono text-zinc-400">
                      {formatFileSize(selectedDoc.file_size)}
                    </span>
                  </div>

                  <h2 className="text-base sm:text-lg font-bold text-zinc-100 leading-snug break-words">
                    {selectedDoc.title}
                  </h2>

                  {activeTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-zinc-800/60">
                      {activeTags.map((tag, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-400"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Grade de Estatísticas e Metadados */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] mb-1 font-mono">
                      <Folder className="w-3.5 h-3.5 text-purple-400" />
                      <span>CATEGORIA</span>
                    </div>
                    <span className="text-xs font-semibold text-zinc-200 uppercase truncate block">
                      {selectedDoc.folders?.name || 'Geral'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                    <div className="flex items-center gap-1.5 text-zinc-500 text-[11px] mb-1 font-mono">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      <span>INDEXAÇÃO</span>
                    </div>
                    <span className="text-xs font-mono font-medium text-zinc-200 block">
                      {new Date(selectedDoc.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                {/* Card de Síntese Inteligente (IA) */}
                <div className="flex-1 flex flex-col rounded-xl bg-zinc-950/80 border border-zinc-800/90 overflow-hidden shadow-sm">
                  <div className="px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      <span>Síntese Executiva Gerada por IA</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopySummary}
                      className="text-xs font-medium text-zinc-400 hover:text-white flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-zinc-800"
                      title="Copiar resumo"
                    >
                      {copiedSummary ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 text-[11px]">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className="text-[11px]">Copiar</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="p-4 flex-1 overflow-y-auto">
                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
                      {selectedDoc.ai_summary}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-500 border border-dashed border-zinc-800/80 rounded-xl">
                <FileText className="w-8 h-8 text-zinc-600 mb-2" />
                <p className="text-xs font-medium text-zinc-400">Nenhum documento selecionado</p>
                <p className="text-[11px] text-zinc-600 mt-1">
                  Selecione um arquivo da lista ao lado para inspecionar seu resumo e metadados.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* =========================================================
            COLUNA 3: TERMINAL DE ESTUDO (DIREITA - 4 COLUNAS)
        ========================================================= */}
        <section
          className={`col-span-12 xl:col-span-4 flex-col h-full overflow-hidden bg-zinc-900/40 border border-zinc-800/80 rounded-2xl backdrop-blur-md shadow-sm ${
            activeTab === 'chat' ? 'flex' : 'hidden xl:flex'
          }`}
        >
          {/* Header da Coluna 3 */}
          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between shrink-0 bg-zinc-950/40">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-3.5 bg-purple-500 rounded-full" />
              <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">
                03. Tutor de Estudos IA
              </span>
            </div>
          </div>

          <div className="p-3.5 sm:p-4 flex flex-col gap-3 flex-1 overflow-hidden min-h-[520px] xl:min-h-0">
            
            {/* Seletor Moderno de Modo de Estudo (3 Modos) */}
            <div className="grid grid-cols-3 gap-2 shrink-0">
              {(['socratico', 'explicativo', 'quiz'] as const).map((mode) => {
                const active = studyMode === mode;
                const info = STUDY_MODES_CONFIG[mode];
                const ModeIcon = info.icon;

                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setStudyMode(mode)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      active
                        ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-900/30'
                        : 'bg-zinc-950/60 border-zinc-800/90 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900/70 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-[11px] font-bold tracking-tight">
                        {info.title}
                      </span>
                    </div>
                    <span
                      className={`text-[9px] uppercase font-mono tracking-wider truncate ${
                        active ? 'text-purple-100 font-medium' : 'text-zinc-500'
                      }`}
                    >
                      {info.role}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Descrição Didática do Modo Ativo */}
            <div className="px-3 py-2 rounded-xl bg-zinc-950/60 border border-zinc-800/80 flex items-start gap-2 shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
              <p className="text-[11px] text-zinc-300 leading-snug">
                <span className="font-semibold text-purple-300">
                  {STUDY_MODES_CONFIG[studyMode].title}:
                </span>{' '}
                {STUDY_MODES_CONFIG[studyMode].description}
              </p>
            </div>

            {/* Lista de Mensagens do Chat */}
            <div className="flex-1 bg-zinc-950/80 border border-zinc-800/90 rounded-xl p-3 overflow-y-auto space-y-3 min-h-[220px]">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
                  <div className="w-10 h-10 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-2">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-medium text-zinc-300">Workspace de Estudo Vazio</p>
                  <p className="text-[11px] text-zinc-500 mt-1 max-w-[260px]">
                    Envie uma dúvida sobre o PDF ou escolha uma das perguntas sugeridas abaixo.
                  </p>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isUser = m.role === 'user';
                  return (
                    <div
                      key={idx}
                      className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isUser && (
                        <div className="w-6 h-6 rounded-md bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0 mt-0.5">
                          <Bot className="w-3.5 h-3.5" />
                        </div>
                      )}

                      <div
                        className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed whitespace-pre-wrap ${
                          isUser
                            ? 'bg-purple-600 text-white rounded-tr-xs shadow-sm shadow-purple-950/40'
                            : 'bg-zinc-900 border border-zinc-800/90 text-zinc-200 rounded-tl-xs shadow-sm'
                        }`}
                      >
                        <div
                          className={`text-[9px] font-mono uppercase mb-1 ${
                            isUser ? 'text-purple-200' : 'text-purple-400 font-semibold'
                          }`}
                        >
                          {isUser ? 'Você' : `Tutor IA // ${STUDY_MODES_CONFIG[studyMode].title}`}
                        </div>
                        {m.content}
                      </div>

                      {isUser && (
                        <div className="w-6 h-6 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mt-0.5">
                          <User className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {loadingChat && (
                <div className="flex gap-2.5 items-start">
                  <div className="w-6 h-6 rounded-md bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 animate-pulse" />
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800/90 text-purple-300 rounded-2xl rounded-tl-xs p-3 text-xs flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                    <span>Gemini analisando contexto e formulando resposta...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Perguntas Sugeridas / Ações Rápidas */}
            <div className="space-y-1.5 shrink-0">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 px-1">
                <span>SUGESTÕES PARA O MODO ATIVO</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS[studyMode].map((prompt, pIdx) => (
                  <button
                    key={pIdx}
                    type="button"
                    onClick={() => {
                      setInputMsg(prompt);
                      inputRef.current?.focus();
                    }}
                    className="text-[10px] text-zinc-300 hover:text-purple-200 bg-zinc-950/70 hover:bg-zinc-900 border border-zinc-800/90 hover:border-purple-500/50 rounded-lg px-2.5 py-1 transition-all text-left truncate max-w-full"
                  >
                    💡 {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Formulário de Envio com Design Moderno */}
            <form onSubmit={(e) => handleSendMessage(e)} className="shrink-0">
              <div className="relative flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-1 focus-within:border-purple-500/80 focus-within:ring-1 focus-within:ring-purple-500/30 transition-all">
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
                  className="w-full bg-transparent text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 px-3 py-2 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!selectedDoc || loadingChat || !inputMsg.trim()}
                  className="p-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:hover:bg-purple-600 text-white transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-sm shadow-purple-900/40"
                  title="Enviar mensagem"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>

          </div>
        </section>

      </div>
    </div>
  );
}
