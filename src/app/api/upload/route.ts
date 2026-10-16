import { NextResponse } from 'next/server';
import { supabase } from '../../lib/supabase';
import { ai, pdfAnalysisSchema, GEMINI_MODEL } from '../../lib/gemini';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Apenas arquivos PDF são permitidos.' },
        { status: 400 }
      );
    }

    // Converte o arquivo para Buffer (Storage) e Base64 (Gemini)
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const base64Pdf = fileBuffer.toString('base64');

    // Remove caracteres especiais do nome do arquivo para evitar erro na URL
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueFilename = `${crypto.randomUUID()}_${safeFileName}`;

    // 1. Upload do PDF para o Bucket 'pdfs' no Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(uniqueFilename, fileBuffer, {
        contentType: 'application/pdf',
      });

    if (uploadError) throw new Error(`Erro no Storage: ${uploadError.message}`);

    const { data: publicUrlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(uniqueFilename);

    const fileUrl = publicUrlData.publicUrl;

    // 2. Envia o PDF diretamente para o Gemini analisar e organizar por pasta
    const prompt =
      'Você é o motor de indexação e organização técnica do Poimp. ' +
      'Analise os arquivos recebidos e realize uma análise estritamente objetiva do PDF anexado: ' +
      '1. Organize o documento determinando uma pasta temática concisa, formal e precisa para armazenamento (ex: "Arquitetura de Software", "Sistemas Distribuídos", "Banco de Dados", "Segurança da Informação", "DevOps e Cloud", "Engenharia de Dados", "Algoritmos e Estruturas de Dados"). ' +
      '2. Elabore uma análise estritamente objetiva em tópicos diretos: Objetivo Principal, Arquitetura/Metodologia, Principais Trade-offs e Recomendações Práticas, sem preâmbulos, sem saudações e sem floreios conversacionais. ' +
      '3. Extraia de 3 a 5 tags técnicas essenciais.';

    const aiResponse = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          inlineData: {
            data: base64Pdf,
            mimeType: 'application/pdf',
          },
        },
        prompt,
      ],
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

    interface AnalysisResult {
      summary?: string;
      suggested_folder?: string;
      suggested_tags?: string[];
    }

    let analysis: AnalysisResult = {};
    try {
      analysis = JSON.parse(rawText || '{}');
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          analysis = JSON.parse(jsonMatch[0]);
        } catch {
          analysis = {};
        }
      }
    }

    // 3. Verifica se a pasta sugerida já existe ou cria uma nova
    const folderName = (analysis.suggested_folder || 'Geral').trim();
    const suggestedTags: string[] = Array.isArray(analysis.suggested_tags) && analysis.suggested_tags.length > 0
      ? analysis.suggested_tags
      : ['estudos', 'documento'];
    const summaryText = analysis.summary || 'Resumo do conteúdo do PDF gerado pelo Gemini.';

    const { data: existingFolder } = await supabase
      .from('folders')
      .select('id')
      .eq('name', folderName)
      .maybeSingle();

    let folderId = existingFolder?.id;

    if (!folderId) {
      const { data: newFolder, error: folderError } = await supabase
        .from('folders')
        .insert({ name: folderName })
        .select('id')
        .single();

      if (folderError) throw folderError;
      folderId = newFolder.id;
    }

    // 4. Salva o Documento no PostgreSQL
    const { data: documentRecord, error: docError } = await supabase
      .from('documents')
      .insert({
        folder_id: folderId,
        title: file.name,
        file_url: fileUrl,
        file_size: file.size,
        ai_summary: summaryText,
      })
      .select('*')
      .single();

    if (docError) throw docError;

    // 5. Vincula as Tags sugeridas ao Documento
    for (const tagName of suggestedTags) {
      const cleanTag = tagName.trim().toLowerCase();

      const { data: existingTag } = await supabase
        .from('tags')
        .select('id')
        .eq('name', cleanTag)
        .maybeSingle();

      let tagId = existingTag?.id;

      if (!tagId) {
        const { data: newTag, error: tagError } = await supabase
          .from('tags')
          .insert({ name: cleanTag })
          .select('id')
          .single();

        if (tagError) throw tagError;
        tagId = newTag.id;
      }

      await supabase.from('document_tags').insert({
        document_id: documentRecord.id,
        tag_id: tagId,
      });
    }

    return NextResponse.json({
      success: true,
      document: documentRecord,
      folder: folderName,
      tags: suggestedTags,
    });
  } catch (error: unknown) {
    console.error('Erro no upload:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno';
    return NextResponse.json(
      { error: `Erro ao processar PDF: ${errorMessage}` },
      { status: 500 }
    );
  }
}