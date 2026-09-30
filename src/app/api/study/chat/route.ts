import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { supabase } from '../../../lib/supabase';
import { ai, GEMINI_MODEL } from '../../../lib/gemini';
import { mockDb } from '../../../lib/mockStore';
import { Content } from '@google/genai';

const SYSTEM_PROMPTS: Record<string, string> = {
  socratico:
    'Você é um Tech Lead e Tutor Socrático. O usuário está estudando o documento em anexo. ' +
    'NUNCA dê a resposta pronta de imediato. Avalie o raciocínio dele, aponte pontos cegos, ' +
    'explique a base teórica se necessário e devolva uma pergunta desafiadora para fazê-lo pensar.',
  explicativo:
    'Você é um Professor Sênior didático e direto. Explique os conceitos do documento ' +
    'com exemplos práticos de código, analogias claras e foco no mercado de trabalho.',
  quiz:
    'Você é um examinador técnico. Com base no documento e no histórico, faça uma pergunta ' +
    'prática de múltipla escolha ou de arquitetura por vez e avalie a resposta do usuário.',
};

export async function POST(request: Request) {
  try {
    const { document_id, message, study_mode = 'socratico' } = await request.json();

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
        const filename = decodeURIComponent(doc.file_url.replace('/api/storage/pdfs/', ''));
        const file = mockDb.storage.get(filename);
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

    // 5. Chama o Gemini com a instrução do modo de estudo escolhido
    const systemInstruction = SYSTEM_PROMPTS[study_mode] || SYSTEM_PROMPTS.socratico;

    const aiResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction,
        temperature: 0.4,
      },
    });

    const answerText = aiResponse.text || 'Não foi possível gerar uma resposta.';

    // 6. Salva a pergunta do usuário e a resposta da IA no PostgreSQL
    await supabase.from('study_messages').insert([
      { document_id, role: 'user', study_mode, content: message },
      { document_id, role: 'model', study_mode, content: answerText },
    ]);

    return NextResponse.json({
      reply: answerText,
      study_mode,
    });
  } catch (error: unknown) {
    console.error('Erro no chat:', error);
    return NextResponse.json(
      { error: `Erro no chat de estudo: ${ (error as Error).message }` },
      { status: 500 }
    );
  }
}