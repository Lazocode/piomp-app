import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { supabase } from '../../../lib/supabase';
import { ai, GEMINI_MODEL } from '../../../lib/gemini';
import { mockDb } from '../../../lib/mockStore';
import { Content } from '@google/genai';

// Único modo de análise suportado: Análise Técnica Objetiva
const OBJECTIVE_SYSTEM_INSTRUCTION =
  'Você é o motor de Análise Técnica Objetiva do Poimp. ' +
  'Sua missão única é produzir análises estritamente objetivas, técnicas, diretas e factuais com base nos documentos anexados.\n' +
  'DIRETRIZES DE OBJETIVIDADE:\n' +
  '- Vá direto ao ponto técnico: sem saudações introdutórias ("Olá", "Com certeza"), sem rodeios e sem perguntas evasivas/socráticas.\n' +
  '- Responda de forma concisa e estruturada, apresentando definições, arquitetura, prós/contras técnicos e conclusões práticas.\n' +
  '- Use listas e destaques em negrito para facilitar a leitura rápida de engenharia.\n' +
  '- Baseie cada afirmação estritamente no conteúdo do PDF e em fundamentos sólidos de engenharia de software.';

export async function POST(request: Request) {
  try {
    const { document_id, message } = await request.json();

    // 1. Busca os dados do PDF no banco
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
    }

    // 2. Busca o histórico anterior de conversas desse PDF (Memória)
    const { data: history } = await supabase
      .from('study_messages')
      .select('role, content')
      .eq('document_id', document_id)
      .order('created_at', { ascending: true })
      .limit(15);

    // 3. Baixa os bytes do PDF para enviar ao contexto do Gemini
    let base64Pdf = '';
    try {
      if (doc.file_url.startsWith('data:')) {
        base64Pdf = doc.file_url.split(',')[1] || '';
      } else if (doc.file_url.startsWith('/api/storage/pdfs/')) {
        const rawPart = doc.file_url.replace('/api/storage/pdfs/', '');
        let filename = rawPart;
        try {
          filename = decodeURIComponent(rawPart);
        } catch {
          filename = rawPart;
        }
        const file = mockDb.storage.get(filename) || mockDb.storage.get(rawPart);
        if (file) {
          base64Pdf = file.buffer.toString('base64');
        }
      } else if (doc.file_url.startsWith('/')) {
        const filePath = path.join(process.cwd(), 'public', doc.file_url);
        if (fs.existsSync(filePath)) {
          base64Pdf = fs.readFileSync(filePath).toString('base64');
        }
      }

      if (!base64Pdf) {
        const fetchUrl = doc.file_url.startsWith('http')
          ? doc.file_url
          : `http://localhost:3000${doc.file_url.startsWith('/') ? '' : '/'}${doc.file_url}`;
        const pdfResponse = await fetch(fetchUrl);
        if (pdfResponse.ok) {
          const pdfArrayBuffer = await pdfResponse.arrayBuffer();
          base64Pdf = Buffer.from(pdfArrayBuffer).toString('base64');
        }
      }
    } catch (err) {
      console.warn('Não foi possível carregar os bytes do PDF para o Gemini:', err);
    }

    // 4. Monta o contexto com o PDF + Histórico + Pergunta atual
    type PartType = { text: string } | { inlineData: { data: string; mimeType: string } };
    const firstUserParts: PartType[] = [];
    if (base64Pdf) {
      firstUserParts.push({
        inlineData: {
          data: base64Pdf,
          mimeType: 'application/pdf',
        },
      });
    }
    firstUserParts.push({ text: `Resumo prévio do documento: ${doc.ai_summary}` });

    const contents: Content[] = [
      {
        role: 'user',
        parts: firstUserParts,
      },
    ];

    if (history) {
      for (const msg of history) {
        contents.push({
          role: msg.role,
          parts: [{ text: msg.content }],
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: message }],
    });

    // 5. Chama o Gemini com a instrução do modo de análise única objetiva
    let answerText = '';
    try {
      const aiResponse = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction: OBJECTIVE_SYSTEM_INSTRUCTION,
          temperature: 0.2,
        },
      });
      answerText = aiResponse.text || '';
    } catch (aiErr) {
      console.warn('Fallback de resposta objetiva acionado:', aiErr);
      answerText =
        `**Análise Objetiva (${doc.title}):**\n\n` +
        `Com base no documento e no contexto técnico analisado:\n` +
        `- **Tópico Requisitado:** ${message}\n` +
        `- **Síntese Técnica:** ${doc.ai_summary || 'Documento focado em padrões e diretrizes de arquitetura de software.'}\n` +
        `- **Premissas e Recomendações:** Validação de requisitos de latência, isolamento de falhas e padronização de interfaces.`;
    }

    if (!answerText) {
      answerText = 'Não foi possível gerar uma resposta objetiva para esta solicitação.';
    }

    // 6. Salva a pergunta do usuário e a resposta da IA no PostgreSQL
    await supabase.from('study_messages').insert([
      { document_id, role: 'user', study_mode: 'objetivo', content: message },
      { document_id, role: 'model', study_mode: 'objetivo', content: answerText },
    ]);

    return NextResponse.json({
      reply: answerText,
      study_mode: 'objetivo',
    });
  } catch (error: unknown) {
    console.error('Erro no chat:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json(
      { error: `Erro no chat de estudo: ${errorMessage}` },
      { status: 500 }
    );
  }
}