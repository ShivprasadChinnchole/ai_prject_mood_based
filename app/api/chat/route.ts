import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

async function callGemini(prompt: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })
    
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()
    
    return text.trim() || ''
  } catch (error) {
    console.error('Gemini API call failed:', error)
    throw error
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, context = 'general' } = await req.json();
    
    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    let prompt = '';
    
    if (context === 'wellness') {
      prompt = `Hi there, I'm here to listen and support you with whatever you're going through. I want you to know that reaching out shows real strength and self-awareness. 🌟

What you shared: ${message}

I'm not going to respond like a textbook or give you clinical advice. Instead, I want to offer you some gentle, caring words that come from a place of genuine understanding and compassion. Please respond naturally, warmly, and personally - like you're talking to someone who truly cares about your wellbeing. Keep it under 180 words and make it feel human and heartfelt. Feel free to use gentle emojis like 💙, ✨, 🌟, 🤗, 🌱, or 💫 to add warmth and connection.`;
    } else {
      prompt = `You are a helpful AI assistant. Provide a clear, informative response.

User: ${message}

Response:`;
    }

    const response = await callGemini(prompt);

    return NextResponse.json({
      message: response || 'I\'m here to help with any questions you have.',
      context: context
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process message',
        message: 'I\'m having trouble responding right now. Please try again.'
      },
      { status: 500 }
    );
  }
}