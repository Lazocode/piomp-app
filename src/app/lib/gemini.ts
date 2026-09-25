import { GoogleGenAI, Type, Schema } from '@google/genai';

export const GEMINI_MODEL = 'gemini-3-flash-preview'; // Modelo de IA do Gemini que será usado para gerar respostas e análises de PDFs.
export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Contrato de dados (equivalente ao Pydantic, mas nativo em TypeScript)
export const pdfAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: 'Resumo executivo e didático dos conceitos principais do PDF.',
    },
    suggested_folder: {
      type: Type.STRING,
      description: 'Nome curto de uma pasta/matéria para categorizar este PDF.',
    },
    suggested_tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Lista com 3 a 5 tags técnicas abordadas no documento.',
    },
  },
  required: ['summary', 'suggested_folder', 'suggested_tags'],
};