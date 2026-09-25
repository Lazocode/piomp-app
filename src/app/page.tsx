'use client';

import { useState, useEffect } from 'react';
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

const STUDY_MODES_CONFIG: Record<
  StudyMode,
  { title: string; role: string; description: string }
> = {
  socratico: {
    title: 'SOCRÁTICO',
    role: 'TECH LEAD // TUTOR',
    description:
      'Não entrega a resposta pronta. Avalia o seu raciocínio, aponta pontos cegos e devolve perguntas para estimular sua lógica.',
  },
  explicativo: {
    title: 'EXPLICATIVO',
    role: 'PROFESSOR SÊNIOR',
    description:
      'Didático e direto ao ponto. Traduz conceitos complexos do PDF com exemplos práticos de código e aplicação de mercado.',
  },
  quiz: {
    title: 'QUIZ',
    role: 'EXAMINADOR TÉCNICO',
    description:
      'Simula provas e entrevistas. Elabora questões de múltipla escolha ou arquitetura sobre o PDF e avalia suas respostas.',
  },
};

export default function HomePage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [studyMode, setStudyMode] = useState<StudyMode>('socratico');
  const [loadingChat, setLoadingChat] = useState(false);

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado';
      alert(msg);
    } finally {
      setUploading(false);
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

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!inputMsg.trim() || !selectedDoc || loadingChat) return;

    const userText = inputMsg;
    setInputMsg('');
    setMessages((prev) => [...prev, { role: 'user', content: userText }]);
    setLoadingChat(true);

    try {
      const res = await fetch('/api/study/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: selectedDoc.id,
          message: userText,
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

  const activeTags =
    selectedDoc?.document_tags?.map((t) => t.tags?.name).filter(Boolean) || [];

  return (
    <div className="h-screen w-screen bg-[#0a0a0a] text-neutral-200 p-4 overflow-hidden font-sans">
      <div className="grid grid-cols-12 gap-4 h-full max-w-[1800px] mx-auto">
        
        {/* =========================================================
            COLUNA 1 (ESQUERDA): GRADE 2xN DE DOCUMENTOS
        ========================================================= */}
        <section className="col-span-3 flex flex-col gap-3 h-full overflow-hidden">
          <div className="h-9 bg-purple-600 text-white font-mono text-xs font-bold uppercase tracking-widest px-4 flex items-center justify-between shrink-0">
            <span>01 // ARQUIVOS</span>
            <span>[{documents.length}]</span>
          </div>

          <div className="flex-1 bg-[#111111] border border-neutral-800 p-4 flex flex-col gap-4 overflow-hidden">
            <label
              className={`w-full py-2.5 px-3 border text-xs font-mono uppercase tracking-wider text-center cursor-pointer transition-colors shrink-0 ${
                uploading
                  ? 'bg-neutral-900 border-purple-500 text-purple-400'
                  : 'bg-[#181818] border-neutral-700 text-neutral-200 hover:border-purple-500 hover:text-purple-400'
              }`}
            >
              {uploading ? 'PROCESSANDO PDF...' : '+ ADICIONAR DOCUMENTO'}
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                {documents.map((doc, idx) => {
                  const isSelected = selectedDoc?.id === doc.id;
                  const isDeleting = deletingId === doc.id;
                  const folder = doc.folders?.name || 'GERAL';

                  return (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedDoc(doc);
                      }}
                      className={`aspect-square p-3 text-left flex flex-col justify-between border transition-colors cursor-pointer relative ${
                        isSelected
                          ? 'bg-purple-600/15 border-purple-500 text-white'
                          : 'bg-[#181818] border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
                      } ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
                    >
                      <div className="w-full flex items-center justify-between font-mono text-[10px] gap-1">
                        <span className={isSelected ? 'text-purple-400 font-bold' : 'text-neutral-500'}>
                          #{String(idx + 1).padStart(2, '0')}
                        </span>
                        <button
                          type="button"
                          title="Remover PDF"
                          onClick={(e) => handleDeleteDocument(doc, e)}
                          className="px-1.5 py-0.5 bg-neutral-900 border border-neutral-700 text-neutral-400 hover:border-red-500 hover:text-red-400 font-mono text-[9px] uppercase transition-colors"
                        >
                          X
                        </button>
                      </div>

                      <div>
                        <span className="inline-block truncate max-w-full uppercase font-mono text-[9px] px-1 mb-1 bg-neutral-900 border border-neutral-800 text-purple-400">
                          {folder}
                        </span>
                        <p className="text-xs font-medium line-clamp-2 leading-snug break-words">
                          {doc.title}
                        </p>
                      </div>

                      <div className="w-full h-1 bg-neutral-800 overflow-hidden">
                        <div
                          className={`h-full ${
                            isSelected ? 'w-full bg-purple-500' : 'w-1/3 bg-neutral-700'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================
            COLUNA 2 (CENTRO): ESTRUTURA DO DOCUMENTO E LEITURA
        ========================================================= */}
        <section className="col-span-5 flex flex-col gap-3 h-full overflow-hidden">
          <div className="h-9 bg-neutral-800 border-l-4 border-purple-500 text-neutral-200 font-mono text-xs font-bold uppercase tracking-widest px-4 flex items-center justify-between shrink-0">
            <span>02 // ESTRUTURA E RESUMO</span>
            {selectedDoc && (
              <div className="flex items-center gap-3">
                <a
                  href={selectedDoc.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-purple-400 hover:underline"
                >
                  [ABRIR ORIGINAL]
                </a>
                <button
                  type="button"
                  onClick={() => handleDeleteDocument(selectedDoc)}
                  disabled={deletingId === selectedDoc.id}
                  className="text-[11px] text-neutral-400 hover:text-red-400 cursor-pointer uppercase"
                >
                  {deletingId === selectedDoc.id ? '[REMOVENDO...]' : '[REMOVER PDF]'}
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 bg-[#111111] border border-neutral-800 p-4 flex flex-col gap-4 overflow-y-auto">
            {selectedDoc ? (
              <>
                <div className="bg-[#1c1c1c] border-l-2 border-purple-500 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                  DOCUMENTO SELECIONADO
                </div>

                <div className="bg-[#161616] border border-neutral-800 p-4">
                  <h2 className="text-base font-semibold text-white break-words">
                    {selectedDoc.title}
                  </h2>
                  {activeTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {activeTags.map((t, i) => (
                        <span
                          key={i}
                          className="font-mono text-[10px] uppercase px-2 py-0.5 bg-neutral-900 border border-neutral-700 text-purple-400"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-[#1c1c1c] border-l-2 border-purple-500 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                  METADADOS DE CATALOGAÇÃO
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#161616] border border-neutral-800 p-3">
                    <span className="block font-mono text-[10px] text-neutral-500 uppercase">
                      CATEGORIA / PASTA
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-purple-400 uppercase truncate">
                      {selectedDoc.folders?.name || 'NÃO CLASSIFICADO'}
                    </span>
                  </div>
                  <div className="bg-[#161616] border border-neutral-800 p-3">
                    <span className="block font-mono text-[10px] text-neutral-500 uppercase">
                      DATA DE INDEXAÇÃO
                    </span>
                    <span className="mt-1 block text-sm font-mono text-neutral-300">
                      {new Date(selectedDoc.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>

                <div className="bg-[#1c1c1c] border-l-2 border-purple-500 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-neutral-400">
                  SÍNTESE DO DOCUMENTO
                </div>

                <div className="flex-1 bg-[#161616] border border-neutral-800 p-4 overflow-y-auto">
                  <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap">
                    {selectedDoc.ai_summary}
                  </p>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center font-mono text-xs text-neutral-600 uppercase">
                NENHUM ARQUIVO SELECIONADO
              </div>
            )}
          </div>
        </section>

        {/* =========================================================
            COLUNA 3 (DIREITA): SESSÃO DE ESTUDO E INTERAÇÃO
        ========================================================= */}
        <section className="col-span-4 flex flex-col gap-3 h-full overflow-hidden">
          <div className="h-9 bg-neutral-800 border-l-4 border-purple-500 text-neutral-200 font-mono text-xs font-bold uppercase tracking-widest px-4 flex items-center justify-between shrink-0">
            <span>03 // TERMINAL DE ESTUDO</span>
            <span className="text-purple-400">{STUDY_MODES_CONFIG[studyMode].title}</span>
          </div>

          <div className="flex-1 bg-[#111111] border border-neutral-800 p-4 flex flex-col gap-3 overflow-hidden">
            {/* Barra de Status Superior */}
            <div className="bg-[#161616] border border-neutral-800 p-3 space-y-2 shrink-0">
              <div className="flex items-center justify-between font-mono text-[10px] text-neutral-400">
                <span>DIRETRIZ: {STUDY_MODES_CONFIG[studyMode].role}</span>
                <span>HISTÓRICO: {messages.length} MSG</span>
              </div>
              <div className="w-3/4 h-1.5 bg-purple-500" />
              <div className="w-full h-1.5 bg-neutral-800" />
            </div>

            {/* Histórico de Mensagens */}
            <div className="flex-1 bg-[#161616] border border-neutral-800 p-3 overflow-y-auto space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center font-mono text-xs text-neutral-600 uppercase text-center px-4">
                  SELECIONE O MODO ABAIXO E ENVIE UMA QUESTÃO PARA INICIAR
                </div>
              ) : (
                messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`p-3 border text-xs leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-[#1f1f1f] border-purple-500/60 text-neutral-100 ml-4'
                        : 'bg-[#121212] border-neutral-800 text-neutral-300 mr-4'
                    }`}
                  >
                    <div className="font-mono text-[10px] uppercase mb-1 text-purple-400">
                      {m.role === 'user' ? 'VOCÊ' : `SISTEMA // ${STUDY_MODES_CONFIG[studyMode].title}`}
                    </div>
                    {m.content}
                  </div>
                ))
              )}
              {loadingChat && (
                <div className="p-3 bg-[#121212] border border-neutral-800 font-mono text-xs text-purple-400 uppercase">
                  PROCESSANDO RESPOSTA...
                </div>
              )}
            </div>

            {/* Seletor de Modo de Operação + Explicação Exposta no Site */}
            <div className="bg-[#1c1c1c] border-l-2 border-purple-500 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-neutral-400 shrink-0">
              MODO DE OPERAÇÃO DA IA
            </div>

            <div className="grid grid-cols-3 gap-2 shrink-0">
              {(['socratico', 'explicativo', 'quiz'] as const).map((mode) => {
                const active = studyMode === mode;
                const info = STUDY_MODES_CONFIG[mode];
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setStudyMode(mode)}
                    className={`p-2 border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                      active
                        ? 'bg-purple-600 border-purple-500 text-white'
                        : 'bg-[#161616] border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
                    }`}
                  >
                    <span className="font-mono text-[11px] font-bold uppercase tracking-wider block">
                      {info.title}
                    </span>
                    <span
                      className={`font-mono text-[9px] uppercase mt-1 block truncate ${
                        active ? 'text-purple-100 font-semibold' : 'text-neutral-500'
                      }`}
                    >
                      {info.role}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Caixa de Especificação do Modo Ativo */}
            <div className="bg-[#161616] border border-neutral-800 p-2.5 shrink-0">
              <div className="font-mono text-[10px] uppercase text-purple-400 mb-1">
                ESPECIFICAÇÃO // {STUDY_MODES_CONFIG[studyMode].title} ({STUDY_MODES_CONFIG[studyMode].role})
              </div>
              <p className="text-[11px] text-neutral-300 leading-snug">
                {STUDY_MODES_CONFIG[studyMode].description}
              </p>
            </div>

            {/* Input de Mensagem */}
            <form onSubmit={handleSendMessage} className="flex gap-2 shrink-0">
              <input
                type="text"
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                disabled={!selectedDoc || loadingChat}
                placeholder="DIGITE SUA PERGUNTA OU RESPOSTA..."
                className="flex-1 bg-[#161616] border border-neutral-800 focus:border-purple-500 px-3 py-2.5 text-xs text-white placeholder-neutral-600 font-mono focus:outline-none"
              />
              <button
                type="submit"
                disabled={!selectedDoc || loadingChat || !inputMsg.trim()}
                className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-mono font-bold text-xs uppercase px-4 py-2.5 cursor-pointer transition-colors"
              >
                ENVIAR
              </button>
            </form>
          </div>
        </section>

      </div>
    </div>
  );
}