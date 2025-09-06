import { NextRequest, NextResponse } from 'next/server'

const languagePatterns: { [key: string]: RegExp[] } = {
  'es': [/\b(hola|gracias|por favor|lo siento|buenas|días|noches)\b/i],
  'fr': [/\b(bonjour|merci|s'il vous plaît|désolé|bonsoir|salut)\b/i],
  'de': [/\b(hallo|danke|bitte|entschuldigung|guten|tag|abend)\b/i],
  'it': [/\b(ciao|grazie|prego|scusi|buongiorno|buonasera)\b/i],
  'pt': [/\b(olá|obrigado|por favor|desculpe|bom|dia|noite)\b/i],
  'ru': [/\b(привет|спасибо|пожалуйста|извините|доброе|утро|вечер)\b/i],
  'ja': [/\b(こんにちは|ありがとう|すみません|おはよう|こんばんは)\b/i],
  'ko': [/\b(안녕|감사|죄송|좋은|아침|저녁)\b/i],
  'zh': [/\b(你好|谢谢|请|对不起|早上|晚上|好)\b/i],
  'hi': [/\b(नमस्ते|धन्यवाद|कृपया|माफ|सुबह|शाम)\b/i],
  'ar': [/\b(مرحبا|شكرا|من فضلك|آسف|صباح|مساء)\b/i],
}

async function callOllama(prompt: string): Promise<string> {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama2',
        prompt: prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    return data.response?.trim() || '';
  } catch (error) {
    console.error('Ollama call failed:', error);
    return '';
  }
}

function detectLanguageByPattern(text: string): string | null {
  for (const [langCode, patterns] of Object.entries(languagePatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return langCode;
      }
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ language: 'en', confidence: 0 });
    }

    // First, try pattern-based detection for common phrases
    const patternDetected = detectLanguageByPattern(text);
    if (patternDetected) {
      return NextResponse.json({ 
        language: patternDetected, 
        confidence: 0.8,
        method: 'pattern'
      });
    }

    // If pattern detection fails, use AI for language detection
    const detectPrompt = `Detect the language of the following text. Respond with only the ISO 639-1 language code (e.g., "en" for English, "es" for Spanish, "fr" for French, etc.). If you're not sure, respond with "en".

Text: "${text}"

Language code:`;

    try {
      const aiDetected = await callOllama(detectPrompt);
      const detectedLang = aiDetected.toLowerCase().replace(/[^a-z]/g, '').substring(0, 2);
      
      // Validate the detected language code
      const validLanguages = ['en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'hi', 'ar'];
      const finalLang = validLanguages.includes(detectedLang) ? detectedLang : 'en';
      
      return NextResponse.json({ 
        language: finalLang, 
        confidence: 0.6,
        method: 'ai'
      });
    } catch (error) {
      console.error('AI language detection failed:', error);
      return NextResponse.json({ 
        language: 'en', 
        confidence: 0.1,
        method: 'fallback'
      });
    }

  } catch (error) {
    console.error('Language detection error:', error);
    return NextResponse.json(
      { error: 'Failed to detect language' },
      { status: 500 }
    );
  }
}
