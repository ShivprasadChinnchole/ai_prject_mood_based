cd "C:\Users\ASUS\OneDrive\Desktop\2.0 india ai\task 2\AI MOOD JOURNAL\REALTIME-CHAT\nextjs-app"
import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
})

interface MoodEntry {
  id: string
  date: string
  entry: string
  aiSentiment: {
    emotions: string[]
    dominantEmotion: string
    intensity: number
    sentiment: 'positive' | 'negative' | 'neutral'
  }
  aiInsight: string
  suggestions: string[]
  timestamp: number
}

const emotionKeywords = {
  'happy': ['happy', 'joy', 'joyful', 'excited', 'cheerful', 'delighted', 'pleased', 'content'],
  'sad': ['sad', 'depressed', 'down', 'unhappy', 'melancholy', 'blue', 'dejected'],
  'angry': ['angry', 'mad', 'furious', 'irritated', 'annoyed', 'frustrated', 'rage'],
  'anxious': ['anxious', 'worried', 'nervous', 'scared', 'fearful', 'panic', 'stress'],
  'stressed': ['stressed', 'overwhelmed', 'pressure', 'burden', 'tension', 'strain'],
  'calm': ['calm', 'peaceful', 'relaxed', 'serene', 'tranquil', 'composed'],
  'excited': ['excited', 'thrilled', 'enthusiastic', 'eager', 'pumped'],
  'grateful': ['grateful', 'thankful', 'appreciative', 'blessed', 'thankfulness'],
  'lonely': ['lonely', 'isolated', 'alone', 'disconnected', 'solitary'],
  'confident': ['confident', 'sure', 'certain', 'self-assured', 'empowered'],
  'overwhelmed': ['overwhelmed', 'swamped', 'buried', 'drowning', 'too much'],
  'peaceful': ['peaceful', 'serene', 'tranquil', 'zen', 'mindful'],
  'hopeful': ['hopeful', 'optimistic', 'positive', 'looking forward', 'expecting'],
  'tired': ['tired', 'exhausted', 'drained', 'weary', 'fatigue'],
  'energetic': ['energetic', 'active', 'vigorous', 'lively', 'dynamic']
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to ensure text ends with complete sentences
function truncateToCompleteSentence(text: string, maxLength: number = 600): string { // Increased by 20% (500 * 1.2)
  if (text.length <= maxLength) {
    return text;
  }
  
  // Find the last complete sentence within the limit
  const truncated = text.substring(0, maxLength);
  
  // Look for sentence endings (., !, ?)
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  
  // If we found a sentence ending, cut there
  if (lastSentenceEnd > maxLength * 0.6) { // Ensure we don't cut too short (at least 60% of max length)
    return text.substring(0, lastSentenceEnd + 1).trim();
  }
  
  // If no good sentence ending found, look for other natural breaks
  const lastPeriod = truncated.lastIndexOf('.');
  if (lastPeriod > maxLength * 0.5) {
    return text.substring(0, lastPeriod + 1).trim();
  }
  
  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.8) {
    return text.substring(0, lastSpace).trim() + '.';
  }
  
  // Last resort: use original truncation but add proper ending
  return truncated.trim() + '.';
}

async function callGroq(prompt: string, maxRetries = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        model: "llama-3.1-8b-instant",
        temperature: 0.7,
        max_tokens: 1228, // Increased by 20% (1024 * 1.2)
      })

      const response = completion.choices[0]?.message?.content?.trim()
      
      if (response && response !== '') {
        return response
      } else {
        throw new Error('Empty response from Groq')
      }
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        throw error;
      }
      await sleep(1000 * attempt);
    }
  }
  throw new Error('Max retries reached');
}

function detectEmotions(text: string): { emotions: string[], dominantEmotion: string, intensity: number } {
  const lowerText = text.toLowerCase();
  const detectedEmotions: { [emotion: string]: number } = {};
  
  // Detect emotions based on keywords with scoring
  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        score += 1;
        // Boost score for exact matches or emotional intensity words
        if (lowerText.includes(`very ${keyword}`) || lowerText.includes(`really ${keyword}`)) {
          score += 2;
        }
      }
    }
    if (score > 0) {
      detectedEmotions[emotion] = score;
    }
  }
  
  // Get ALL significant emotions (not just top 3)
  const sortedEmotions = Object.entries(detectedEmotions)
    .sort(([,a], [,b]) => b - a)
    .filter(([,score]) => score > 0) // Include all detected emotions
    .slice(0, 8); // Max 8 emotions to avoid clutter
  
  const emotions = sortedEmotions.map(([emotion]) => emotion);
  const dominantEmotion = emotions[0] || 'neutral';
  
  // Enhanced intensity calculation
  const intensityWords = ['very', 'extremely', 'really', 'so', 'totally', 'completely', 'absolutely', 'incredibly', 'deeply', 'overwhelming'];
  const calmingWords = ['little', 'slightly', 'somewhat', 'kind of', 'sort of'];
  
  let intensity = 5; // Default neutral
  
  intensityWords.forEach(word => {
    if (lowerText.includes(word)) {
      intensity += 1;
    }
  });
  
  calmingWords.forEach(word => {
    if (lowerText.includes(word)) {
      intensity -= 1;
    }
  });
  
  // Boost intensity based on number of detected emotions
  if (emotions.length >= 4) intensity += 1;
  if (emotions.length >= 6) intensity += 1;
  
  intensity = Math.min(Math.max(intensity, 1), 10);
  
  return { emotions, dominantEmotion, intensity };
}

function analyzeSentiment(text: string, emotions: string[]): 'positive' | 'negative' | 'neutral' {
  const positiveEmotions = ['happy', 'excited', 'grateful', 'confident', 'peaceful', 'hopeful', 'energetic', 'calm'];
  const negativeEmotions = ['sad', 'angry', 'anxious', 'stressed', 'lonely', 'overwhelmed', 'tired'];
  
  const positiveCount = emotions.filter(e => positiveEmotions.includes(e)).length;
  const negativeCount = emotions.filter(e => negativeEmotions.includes(e)).length;
  
  if (positiveCount > negativeCount) return 'positive';
  if (negativeCount > positiveCount) return 'negative';
  return 'neutral';
}

export async function POST(req: NextRequest) {
  try {
    const { entry, previousEntries = [], isIncident = false } = await req.json();
    
    if (!entry || entry.trim().length === 0) {
      return NextResponse.json(
        { error: 'Journal entry is required' },
        { status: 400 }
      );
    }

    console.log('Analyzing mood entry:', { entryLength: entry.length, isIncident });

    // Step 1: Detect emotions and sentiment
    const emotionAnalysis = detectEmotions(entry);
    const sentiment = analyzeSentiment(entry, emotionAnalysis.emotions);

    // Step 2: Generate AI insight
    const contextText = previousEntries.length > 0 
      ? `Previous emotional patterns: ${previousEntries.slice(-3).map((e: MoodEntry) => e.aiSentiment.dominantEmotion).join(', ')}`
      : 'This is a new emotional journal.';

    const insightPrompt = isIncident ? 
      `You are a warm, compassionate AI counselor with deep empathy. Analyze this specific incident with genuine care and understanding.

Incident Details: "${entry}"
Detected emotions: ${emotionAnalysis.emotions.join(', ')}
Dominant emotion: ${emotionAnalysis.dominantEmotion}
Emotional intensity: ${emotionAnalysis.intensity}/10
Previous emotional context: ${contextText}

Provide a deeply empathetic, detailed insight (4-6 sentences) that:
1. Acknowledges their specific experience with genuine understanding
2. Validates their emotions without judgment
3. Offers thoughtful perspective on the situation
4. Provides emotional support and encouragement
5. Gently guides them toward healing and growth

Write in a warm, supportive tone as if you're a caring friend who truly understands. Be specific to their situation and emotions.

Compassionate Insight:` :
      
      `You are a warm, supportive AI wellness companion who deeply cares about emotional wellbeing. Analyze this journal entry with genuine empathy and understanding.

Journal Details: "${entry}"
Detected emotions: ${emotionAnalysis.emotions.join(', ')}
Dominant emotion: ${emotionAnalysis.dominantEmotion}
Emotional intensity: ${emotionAnalysis.intensity}/10
${contextText}

Provide a heartfelt, detailed insight (4-6 sentences) that:
1. Reflects their emotional experience with deep understanding
2. Celebrates their courage in sharing and self-reflection
3. Offers personalized observations about their emotional journey
4. Provides gentle encouragement and emotional support
5. Highlights their strength and resilience

Write with genuine warmth and care, as if you're a trusted friend who sees their worth. Make it personal and meaningful.

Caring Insight:`;

    let aiInsight = '';
    try {
      const rawInsight = await callGroq(insightPrompt);
      const cleanedInsight = rawInsight
        .replace(/^(Insight:|AI Insight:|Response:|Compassionate Insight:|Caring Insight:)/i, '')
        .trim();
      
      // Ensure we complete sentences rather than cutting mid-sentence
      aiInsight = truncateToCompleteSentence(cleanedInsight, 600); // Increased by 20% (500 * 1.2)
        
      if (aiInsight.length === 0) {
        aiInsight = getDefaultInsight(emotionAnalysis.dominantEmotion, sentiment, isIncident);
      }
    } catch (error) {
      console.error('AI insight generation failed:', error);
      aiInsight = getDefaultInsight(emotionAnalysis.dominantEmotion, sentiment, isIncident);
    }

    // Step 3: Generate comprehensive, actionable suggestions
    let suggestions: string[] = [];
    try {
      const suggestionPrompt = isIncident ?
        `Based on this specific incident, provide 4-5 detailed, actionable strategies to help them process, heal, and grow stronger:

Incident: "${entry.substring(0, 300)}"
Dominant emotion: ${emotionAnalysis.dominantEmotion}
All emotions: ${emotionAnalysis.emotions.join(', ')}
Intensity: ${emotionAnalysis.intensity}/10

Provide specific, practical suggestions that are:
- Immediately actionable and helpful
- Tailored to their specific emotional state
- Progressive (short-term relief to long-term growth)
- Empowering and encouraging

Format each suggestion as a complete, helpful sentence.

Detailed Suggestions:` :
        
        `Based on this emotional state, provide 4-5 comprehensive wellness strategies to support their emotional journey:

Entry: "${entry.substring(0, 300)}"
Emotions: ${emotionAnalysis.emotions.join(', ')}
Dominant feeling: ${emotionAnalysis.dominantEmotion}
Intensity: ${emotionAnalysis.intensity}/10

Provide personalized, actionable suggestions that:
- Address their specific emotional needs
- Offer both immediate comfort and long-term growth
- Are practical and easy to implement
- Build emotional resilience and self-care

Format each suggestion as a caring, detailed recommendation.

Personalized Suggestions:`;

      const rawSuggestions = await callGroq(suggestionPrompt);
      suggestions = rawSuggestions
        .split('\n')
        .filter((line: string) => line.trim().length > 10)
        .slice(0, 6) // Increased by 20% (5 * 1.2 = 6) suggestions for more comprehensive advice
        .map((sug: string) => sug.replace(/^\d+\.\s*|-\s*|\*\s*/, '').trim())
        .map((sug: string) => truncateToCompleteSentence(sug, 240)) // Increased by 20% (200 * 1.2) - Ensure each suggestion is a complete sentence
        .filter((sug: string) => sug.length > 0);
        
      // Fallback to default suggestions if AI didn't provide enough
      if (suggestions.length < 3) {
        suggestions = getDefaultSuggestions(emotionAnalysis.dominantEmotion, sentiment, isIncident);
      }
    } catch (error) {
      console.error('Suggestion generation failed:', error);
      suggestions = getDefaultSuggestions(emotionAnalysis.dominantEmotion, sentiment, isIncident);
    }

    return NextResponse.json({
      sentiment: {
        emotions: emotionAnalysis.emotions,
        dominantEmotion: emotionAnalysis.dominantEmotion,
        intensity: emotionAnalysis.intensity,
        sentiment: sentiment
      },
      insight: aiInsight,
      suggestions: suggestions,
      analysisComplete: true
    });

  } catch (error) {
    console.error('Mood analysis error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze mood entry',
        sentiment: {
          emotions: ['neutral'],
          dominantEmotion: 'neutral',
          intensity: 5,
          sentiment: 'neutral'
        },
        insight: 'Thank you for sharing your thoughts. Every entry helps you understand yourself better.',
        suggestions: ['Take a few deep breaths', 'Practice self-compassion', 'Reflect on your feelings']
      },
      { status: 500 }
    );
  }
}

function getDefaultInsight(dominantEmotion: string, sentiment: string, isIncident: boolean): string {
  const heartWarmingInsights = {
    incident_negative: "I can feel the weight of this difficult moment in your words, and I want you to know that your courage in sharing it moves me deeply. Your strength in facing challenges head-on, even when it hurts, shows the incredible resilience of your beautiful spirit. This painful experience is shaping you into someone even more compassionate and wise. Remember, you've survived 100% of your difficult days so far - that's an amazing track record.",
    
    incident_positive: "The joy radiating from your words about this wonderful experience fills my heart with warmth! Your ability to recognize and savor these precious moments shows your incredible appreciation for life's gifts. This beautiful memory you've created will be a source of light during any future challenges. Your enthusiasm and gratitude are absolutely contagious and inspiring.",
    
    incident_neutral: "Thank you for trusting me with this meaningful moment from your life. Your willingness to reflect and share shows remarkable emotional intelligence and self-awareness. Every experience, including this one, is weaving itself into the beautiful tapestry of your unique story. You're growing and learning in ways that will serve you throughout your incredible journey.",
    
    daily_positive: "Your radiant positive energy absolutely lights up everything around you! The happiness and contentment flowing through your words reminds me of sunshine breaking through clouds. This beautiful emotional state you're cultivating is a gift - not just to yourself, but to everyone lucky enough to be in your presence. Your joy is proof of your inner strength and wisdom.",
    
    daily_negative: "I can sense you're carrying some heavy feelings today, and I want you to know that your vulnerability in sharing them shows tremendous courage. Your tender heart that feels so deeply is actually one of your greatest strengths. These difficult emotions you're experiencing are temporary visitors, not permanent residents. You have an incredible capacity for healing and renewal.",
    
    daily_neutral: "Your thoughtful reflection today shows the beautiful depth of your introspective nature. Taking time to pause and examine your inner world demonstrates remarkable emotional wisdom. This mindful awareness you're practicing is like tending a garden - with each moment of attention, you're nurturing your emotional growth and wellbeing."
  };
  
  if (isIncident) {
    if (sentiment === 'negative') return heartWarmingInsights.incident_negative;
    if (sentiment === 'positive') return heartWarmingInsights.incident_positive;
    return heartWarmingInsights.incident_neutral;
  } else {
    if (sentiment === 'positive') return heartWarmingInsights.daily_positive;
    if (sentiment === 'negative') return heartWarmingInsights.daily_negative;
    return heartWarmingInsights.daily_neutral;
  }
}

function getDefaultSuggestions(dominantEmotion: string, sentiment: string, isIncident: boolean): string[] {
  const comprehensiveSuggestions = {
    incident_negative: [
      "Share your feelings with a trusted friend or family member who can provide emotional support and perspective",
      "Practice the 5-4-3-2-1 grounding technique: notice 5 things you see, 4 you hear, 3 you feel, 2 you smell, 1 you taste",
      "Write a letter to yourself about what you learned from this experience and how it made you stronger",
      "Engage in gentle physical activity like walking or stretching to help process difficult emotions naturally",
      "Create a self-care plan with specific activities that bring you comfort and peace during challenging times"
    ],
    
    incident_positive: [
      "Celebrate this wonderful moment by sharing it with someone special who would appreciate your joy",
      "Document this positive experience in detail so you can revisit it during more challenging times",
      "Identify the specific elements that made this situation so positive and plan how to recreate them",
      "Express gratitude by writing thank-you notes to people who contributed to this beautiful experience",
      "Use this positive energy to reach out and brighten someone else's day with kindness or encouragement"
    ],
    
    daily_positive: [
      "Channel this beautiful energy into activities that bring you lasting fulfillment and joy",
      "Share your positive vibes by doing something kind for a friend, neighbor, or stranger today",
      "Create a gratitude practice by writing down three specific things that made you smile today",
      "Use this momentum to work on a personal goal or project that brings you deep satisfaction",
      "Plan an activity for tomorrow that will help maintain this wonderful emotional state"
    ],
    
    daily_negative: [
      "Practice radical self-compassion by speaking to yourself as kindly as you would to your best friend",
      "Connect with nature by spending 10-15 minutes outside, even if it's just sitting by a window",
      "Try progressive muscle relaxation or guided meditation to release physical tension from emotional stress",
      "Reach out to your support network - sometimes just voicing your feelings can lighten their weight",
      "Engage in a nurturing activity like taking a warm bath, making tea, or listening to soothing music"
    ],
    
    daily_neutral: [
      "Take a mindful walk without distractions, paying attention to your surroundings and breathing",
      "Practice gratitude by identifying three small moments of beauty or kindness you noticed today",
      "Engage in a creative activity that allows for gentle self-expression, like drawing, writing, or music",
      "Connect with someone you care about through a meaningful conversation or simple check-in message",
      "Set a small, achievable intention for tomorrow that aligns with your values and wellbeing"
    ]
  };
  
  if (isIncident) {
    return sentiment === 'negative' ? comprehensiveSuggestions.incident_negative : comprehensiveSuggestions.incident_positive;
  } else {
    if (sentiment === 'positive') return comprehensiveSuggestions.daily_positive;
    if (sentiment === 'negative') return comprehensiveSuggestions.daily_negative;
    return comprehensiveSuggestions.daily_neutral;
  }
}
