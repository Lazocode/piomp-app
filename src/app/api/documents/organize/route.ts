import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import { supabase } from '../../../lib/supabase';
import { ai, GEMINI_MODEL, pdfAnalysisSchema } from '../../../lib/gemini';
import { mockDb } from '../../../lib/mockStore';

interface DocumentRecordType {
  id: string;
  title: string;
  file_url: string;
  file_size?: number;
  ai_summary: string;
  folder_id?: string | null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const targetDocumentId = body.document_id as string | undefined;

    // 1. Busca os documentos a serem organizados
    let query = supabase.from('documents').select('*');
    if (targetDocumentId) {
      query = query.eq('id', targetDocumentId);
    }

    const { data: rawDocs, error: fetchError } = await query;
    if (fetchError || !rawDocs || rawDocs.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum documento encontrado para organizar.' },
        { status: 404 }
      );
    }

    const docs = rawDocs as DocumentRecordType[];
    const organizedResults = [];

    // 2. Itera sobre os documentos e utiliza o Gemini para classificação objetiva por pasta
    for (const doc of docs) {
      // Tenta acessar o conteúdo real do arquivo PDF
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
        console.warn(`Aviso ao ler bytes do PDF ${doc.title}:`, err);
      }

      const prompt =
        'Você é o motor inteligente de organização de acervo técnico do Poimp. ' +
        'Analise os arquivos e estruture o documento nas pastas adequadas de forma estritamente objetiva:\n' +
        `Título do documento: "${doc.title}"\n` +
        `Resumo prévio: "${doc.ai_summary || 'Não informado'}"\n\n` +
        'DIRETRIZES:\n' +
        '1. Determine a pasta temática mais concisa e formal para agrupar este arquivo (ex: "Arquitetura de Software", "Sistemas Distribuídos", "Banco de Dados", "Segurança da Informação", "DevOps e Cloud", "Engenharia de Dados", "Algoritmos e Estruturas de Dados").\n' +
        '2. Forneça uma análise estritamente objetiva em tópicos diretos (Objetivo Central, Arquitetura/Padrões e Decisões Práticas).\n' +
        '3. Defina 3 a 5 tags técnicas essenciais.';

      type PartType = { text: string } | { inlineData: { data: string; mimeType: string } };
      const contentsParts: PartType[] = [];

      if (base64Pdf) {
        contentsParts.push({
          inlineData: {
            data: base64Pdf,
            mimeType: 'application/pdf',
          },
        });
      }
      contentsParts.push({ text: prompt });

      let analysis: { summary?: string; suggested_folder?: string; suggested_tags?: string[] } = {};

      try {
        const aiResponse = await ai.models.generateContent({
          model: GEMINI_MODEL,
          contents: contentsParts,
          config: {
            responseMimeType: 'application/json',
            responseSchema: pdfAnalysisSchema,
            temperature: 0.2,
          },
        });

        let rawText = (aiResponse.text || '').trim();
        if (rawText.startsWith('```json')) {
          rawText = rawText.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
        } else if (rawText.startsWith('```')) {
          rawText = rawText.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
        }

        try {
          analysis = JSON.parse(rawText || '{}');
        } catch {
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            analysis = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (aiErr) {
        console.warn('Fallback semântico de organização acionado:', aiErr);
        // Fallback semântico heurístico para classificação em pastas
        const lowerTitle = doc.title.toLowerCase();
        let fallbackFolder = 'Arquitetura de Software';
        if (lowerTitle.includes('banco') || lowerTitle.includes('sql') || lowerTitle.includes('dados')) {
          fallbackFolder = 'Banco de Dados';
        } else if (lowerTitle.includes('seguran') || lowerTitle.includes('auth') || lowerTitle.includes('cripto')) {
          fallbackFolder = 'Segurança da Informação';
        } else if (lowerTitle.includes('rede') || lowerTitle.includes('infra') || lowerTitle.includes('cloud')) {
          fallbackFolder = 'DevOps e Infraestrutura';
        } else if (lowerTitle.includes('algoritmo') || lowerTitle.includes('estrutura')) {
          fallbackFolder = 'Algoritmos e Estruturas de Dados';
        }

        analysis = {
          suggested_folder: fallbackFolder,
          summary: doc.ai_summary || `Análise objetiva do documento ${doc.title}: conceitos centrais, padrões arquiteturais e premissas técnicas essenciais.`,
          suggested_tags: ['engenharia', 'arquitetura', 'tecnologia'],
        };
      }

      const folderName = (analysis.suggested_folder || 'Geral').trim();
      const updatedSummary = analysis.summary || doc.ai_summary;
      const tags = analysis.suggested_tags || [];

      // Verifica se a pasta existe ou cria
      const { data: existingFolder } = await supabase
        .from('folders')
        .select('id')
        .eq('name', folderName)
        .maybeSingle();

      let folderId = existingFolder?.id;

      if (!folderId) {
        const { data: newFolder } = await supabase
          .from('folders')
          .insert({ name: folderName })
          .select('id')
          .single();

        folderId = newFolder?.id;
      }

      // Atualiza o documento no banco com a nova pasta e análise objetiva
      await supabase
        .from('documents')
        .update({
          folder_id: folderId,
          ai_summary: updatedSummary,
        })
        .eq('id', doc.id);

      organizedResults.push({
        document_id: doc.id,
        title: doc.title,
        folder: folderName,
        tags,
      });
    }

    return NextResponse.json({
      success: true,
      message: `${organizedResults.length} documento(s) organizado(s) com sucesso nas pastas pela API.`,
      organized: organizedResults,
    });
  } catch (error: unknown) {
    console.error('Erro ao organizar documentos:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json(
      { error: `Falha na organização automática: ${errorMessage}` },
      { status: 500 }
    );
  }
}
