import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

async function callGroq(prompt: string): Promise<string> {
  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      model: "llama-3.1-8b-instant", // Fast and efficient model
      temperature: 0.7,
      max_tokens: 1228, // Increased by 20% (1024 * 1.2)
    })

    return completion.choices[0]?.message?.content?.trim() || ''
  } catch (error) {
    console.error('Groq API call failed:', error)
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
      prompt = `You are a compassionate AI wellness assistant. Provide supportive, encouraging responses about mental health and wellbeing. Keep responses warm and under 180 words. // Increased by 20% (150 * 1.2)

User: ${message}

Response:`;
    } else {
      prompt = `You are a helpful AI assistant. Provide a clear, informative response.

User: ${message}

Response:`;
    }

    const response = await callGroq(prompt);

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