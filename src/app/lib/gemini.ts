import { GoogleGenAI, Type, Schema } from '@google/genai';

export const GEMINI_MODEL = 'gemini-3.8-flash'; // Modelo padrão de alta performance e precisão para análises objetivas.
export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Contrato de dados estruturados para análise técnica objetiva e organização automática
export const pdfAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description:
        'Síntese estritamente objetiva, técnica e direta do documento. Destaque objetivos, arquitetura/metodologia e conclusões essenciais em tópicos limpos, sem saudações ou rodeios.',
    },
    suggested_folder: {
      type: Type.STRING,
      description:
        'Nome conciso, formal e padronizado da pasta temática para arquivar o documento (ex: "Arquitetura de Software", "Sistemas Distribuídos", "Banco de Dados", "Segurança da Informação", "DevOps e Cloud", "Engenharia de Dados").',
    },
    suggested_tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Lista com 3 a 5 tags técnicas fundamentais abordadas no arquivo.',
    },
  },
  required: ['summary', 'suggested_folder', 'suggested_tags'],
};