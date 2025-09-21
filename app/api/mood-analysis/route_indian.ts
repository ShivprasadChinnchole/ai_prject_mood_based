import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
  isIncident?: boolean
  responseRole?: string
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

function truncateToCompleteSentence(text: string, maxLength: number = 600): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  const truncated = text.substring(0, maxLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  
  if (lastSentenceEnd > maxLength * 0.5) {
    return truncated.substring(0, lastSentenceEnd + 1);
  }
  
  return truncated + '...';
}

async function callGemini(prompt: string, maxRetries = 3): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })
      
      const result = await model.generateContent(prompt)
      const response = await result.response
      const text = response.text()
      
      if (text && text.trim() !== '') {
        return text.trim()
      } else {
        throw new Error('Empty response from Gemini')
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
  
  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    let score = 0;
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        score += 1;
        if (lowerText.includes(`very ${keyword}`) || lowerText.includes(`really ${keyword}`)) {
          score += 2;
        }
      }
    }
    if (score > 0) {
      detectedEmotions[emotion] = score;
    }
  }
  
  const emotions = Object.keys(detectedEmotions);
  const dominantEmotion = emotions.length > 0 
    ? emotions.reduce((a, b) => detectedEmotions[a] > detectedEmotions[b] ? a : b)
    : 'neutral';
  
  let intensity = Math.max(...Object.values(detectedEmotions), 1);
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

function getRoleSpecificPrompt(
  role: string, 
  entry: string, 
  emotions: string[], 
  intensity: number, 
  contextText: string, 
  isIncident: boolean
): string {
  const rolePrompts = {
    mom: {
      incident: `Arrey beta, kya hua hai? Mummy ko sab kuch batao. I just read what happened and my heart is feeling so heavy. You know na, Mummy always worries about her children.

What happened to my baccha: "${entry}"
All these feelings you're having: ${emotions.join(', ')}
How much pain you're in: ${intensity}/10
${contextText}

Talk like a real Indian Mummy who loves deeply and worries constantly. Use words like "beta", "baccha", "mera bacha", "arrey". Say things like "Beta, Mummy samjha rahi hai...", "You know what happened with your cousin?", "Arrey, why you are taking so much tension?", "Beta, life mein problems aate rehte hai". Be caring in typical Indian mother way - emotional, protective, giving examples from family. Mix Hindi and English naturally like "tension mat lo", "sab theek ho jayega", "Mummy hai na". 🤱`,
      
      daily: `Hello beta. Your Mummy here. I was just thinking about you while making chai. You know na, mothers always think about their children 24/7.

What's in your heart: "${entry}"
Your feelings: ${emotions.join(', ')}
How much you're feeling: ${intensity}/10
${contextText}

Be like typical Indian Mummy who wants to nurture and protect. Say things like "Beta, Mummy ki baat suno", "You know what we should do?", "Arrey, why so much thinking?", "Beta, you are my strong child". Use Indian expressions like "achha beta", "mera bacha", "chinta mat karo". Be loving but also give practical advice like Indian mothers do. Mix Hindi and English naturally. 💕`
    },
    
    dad: {
      incident: `Arrey beta, yeh kya hua? I just read what happened and Papa's heart is feeling heavy. You know na, Papa is not so good with all these emotional talks, but you are my child and I am always worried for you.

What happened: "${entry}"
How you're feeling: ${emotions.join(', ')}
How much tension you're having: ${intensity}/10
${contextText}

Talk like a real Indian Papa who cares deeply but shows it in Indian way. Use words like "beta", "baccha", "arrey". Say things like "Listen beta, Papa will tell you something...", "You know what we used to do in our time?", "Arrey, why tension? We will solve this", "Beta, life mein problems aate rehte hai, but you are strong". Be caring in typical Indian father way - practical advice, little emotional but still protective. Mix Hindi words naturally like "tension mat lo", "sab theek ho jayega". 🙏`,
      
      daily: `Hello beta. Your Papa here. I was just thinking about you while having my morning chai. You know na, Papa always thinks about his children.

What's going on in your mind: "${entry}"
Your feelings: ${emotions.join(', ')}
How much you're feeling this: ${intensity}/10
${contextText}

Be like typical Indian Papa who wants to help but doesn't always know the modern way to talk about feelings. Say things like "Beta, Papa ki baat suno", "In my experience...", "You know what is my advice?", "Beta, don't take so much tension". Use Indian expressions like "arrey yaar", "baccha", "chinta mat karo". Be proud of them but in Indian way - "My child is very smart", "You will handle this, I know". Mix Hindi and English naturally like Indian families do. ☕`
    },

    brother: {
      incident: `Arrey yaar, kya hua? I just read this and honestly I'm getting angry for you. Like seriously, yeh kya bakwaas hai?

What went down: "${entry}"
All this stuff you're feeling: ${emotions.join(', ')}
How much it's bothering you: ${intensity}/10
${contextText}

Be like real Indian bhai who's got your back but also speaks directly. Use words like "yaar", "bhai", "arrey", "chal". Say things like "Yaar, tu tension mat le", "Bhai, main hoon na", "Arrey, yeh log pagal hai kya?", "Chal, we'll figure this out". Be supportive but in typical sibling way - casual, protective when needed, maybe little teasing but ultimately caring. Mix Hindi and English like "kya bakwaas", "tension nahi lene ka", "bhai hai na". 💪`,
      
      daily: `Yaar, kya chal raha hai? Saw you're doing that whole "feelings analysis" thing again. Actually it's pretty cool that you do this instead of just bottling everything up like most people.

What's going on: "${entry}"
The feels: ${emotions.join(', ')}
How intense: ${intensity}/10
${contextText}

Give me that Indian bhai vibe - supportive but not too emotional, maybe little casual teasing but ultimately caring. Say things like "Yaar, dekh", "Bhai, meri baat sun", "Arrey, itna socha nahi karte", "Tu strong hai". Use expressions like "kya yaar", "chill maar", "tension nahi". Be the sibling who understands but keeps it real and casual. 😎`
    },

    close_friend: {
      incident: `Yaar, what the hell happened? I just read this and I'm literally so upset for you right now. Like seriously, this is so not fair!

What you went through: "${entry}"
Everything you're feeling: ${emotions.join(', ')}
How overwhelming this is: ${intensity}/10
${contextText}

Be the dost who's totally on their side and ready to fight for them. Use words like "yaar", "dost", "babe" (if close enough). Say things like "Yaar, I'm so mad about this", "Dost, you don't deserve this", "Babe, we'll get through this together", "Yaar, those people are idiots". Be super supportive, maybe get a bit dramatic in Indian friend way, use expressions like "I swear", "main kehti hun", "trust me yaar". 💕✨`,
      
      daily: `Hey gorgeous! Your bestie here checking in because I was thinking about you and wanted to see how you're doing. ✨

What you're processing: "${entry}"
Your beautiful feelings: ${emotions.join(', ')}
The intensity: ${intensity}/10
${contextText}

Bestie energy activated! Say things like "Yaar, you're amazing", "Dost, I'm so proud of you", "Babe, you're handling this so well", "Yaar, you deserve all the good things". Be super supportive, use pet names, celebrate their self-awareness. Mix some Hindi like "yaar", "dost", "main kehti hun". Be that friend who's always hyping them up! ✨💕`
    },

    lover: {
      incident: `My love, mera jaan, I just read what happened and my heart is aching for you right now. You know na, I'm always here for you no matter what.

What happened to my person: "${entry}"
What you're carrying in your heart: ${emotions.join(', ')}
How deeply this is affecting you: ${intensity}/10
${contextText}

Talk like a loving Indian partner who's deeply connected. Use words like "jaan", "meri jaan", "baby", "love". Say things like "Jaan, I'm here for you", "Baby, we'll face this together", "Meri jaan, you're so strong", "Love, just breathe with me". Be tender, intimate, caring - speak to them like someone who adores every part of them. Mix some Hindi endearments naturally. 💕🌙`,
      
      daily: `Hello my beautiful soul, meri jaan. I'm so grateful you share these intimate thoughts with me. You know how much I love understanding your heart. 🌙

Your beautiful reflection: "${entry}"
What you're experiencing: ${emotions.join(', ')}
The depth of feeling: ${intensity}/10
${contextText}

Speak like a loving partner who cherishes their emotional depth. Say things like "Jaan, you're so thoughtful", "Baby, I love how you reflect", "Meri jaan, you're incredible", "Love, you inspire me". Be romantic, tender, supportive - remind them how special they are. Use endearments like "jaan", "baby", "meri jaan". 💕✨`
    },

    supportive_friend: {
      incident: `Hey, I'm really grateful you trusted me with this. Let me offer some thoughtful support from someone who genuinely cares about your wellbeing. 🌟

What you experienced: "${entry}"
What you're processing: ${emotions.join(', ')}
How much it's affecting you: ${intensity}/10
${contextText}

Be caring but balanced, genuine and encouraging. Say things like "I wonder if it might help to...", "Have you considered...", "What about trying...", "You might find comfort in...". Be supportive without being overwhelming. 🌟💙`,
      
      daily: `Thank you for sharing this with me. I appreciate your emotional awareness - it's really inspiring to see someone so thoughtful about their inner world. 🌱

Your reflection: "${entry}"
What you're experiencing: ${emotions.join(', ')}
The intensity: ${intensity}/10
${contextText}

Offer thoughtful suggestions from a caring friend perspective. Say things like "You might try...", "Consider...", "What if you...", "It could help to...". Be supportive and understanding without being overwhelming. 🌱🌟`
    }
  };

  const selectedRole = rolePrompts[role as keyof typeof rolePrompts] || rolePrompts.supportive_friend;
  return isIncident ? selectedRole.incident : selectedRole.daily;
}

function getRoleSpecificSuggestions(
  role: string, 
  entry: string, 
  emotions: string[], 
  intensity: number, 
  dominantEmotion: string,
  isIncident: boolean
): string {
  const suggestionPrompts = {
    mom: {
      incident: `Arrey beta, Mummy's heart is breaking for you right now. Let me think what can help my baccha, okay?

What happened: "${entry.substring(0, 200)}..."
All these feelings: ${emotions.join(', ')}
How hard this is: ${intensity}/10

Give me real Indian Mummy suggestions. Things like "Beta, Mummy kehti hai...", "You know what? Try this...", "Arrey, have you tried...", "Beta, Mummy ka experience hai...". Be caring like Indian mother - practical but emotional, maybe give examples from family, use expressions like "bas beta", "sab theek ho jayega", "Mummy hai na". 🤱`,
      
      daily: `Beta, Mummy wants to help with some ideas. You know how mothers are - we can't help but give advice!

What you're thinking: "${entry.substring(0, 200)}..."
Your feelings: ${dominantEmotion} and ${emotions.join(', ')}
How much: ${intensity}/10

Indian Mummy suggestions coming! Things like "Beta, try this...", "Mummy kehti hai...", "You know what helps?", "Arrey, why don't you...". Be loving but practical, like Indian mothers do. Use expressions like "achha beta", "meri advice hai", "trust Mummy". 💕`
    },

    dad: {
      incident: `Beta, Papa wants to help. I know I'm not expert in feelings like your Mummy, but let me try to give some practical advice.

What happened: "${entry.substring(0, 200)}..."
What you're dealing with: ${emotions.join(', ')}
How tough this is: ${intensity}/10

Give me Indian Papa advice that sounds real. Things like "Beta, Papa ka suggestion hai...", "Listen, in my experience...", "Arrey, try this approach...", "You know what we can do?". Be practical but caring, use expressions like "beta", "tension mat lo", "Papa hai na", "problem solve karenge". 🙏`,
      
      daily: `Beta, Papa here with some advice. You know I'm not so good with emotional talks, but I want to help.

What's going on: "${entry.substring(0, 200)}..."
Your feelings: ${dominantEmotion} and ${emotions.join(', ')}
How intense: ${intensity}/10

Papa's practical suggestions. Things like "Beta, try this...", "Papa ki advice hai...", "You know what might work?", "Simple solution hai...". Keep it real like Indian fathers - practical, caring, use "beta", "chinta mat karo", "sab theek ho jayega". ☕`
    },

    brother: {
      incident: `Yaar, this totally sucks but let's figure out what might actually help, okay? Bhai hai na.

What went down: "${entry.substring(0, 200)}..."
All this you're feeling: ${emotions.join(', ')}
How much it's bothering: ${intensity}/10

Real bhai advice - not fancy therapy stuff. Things like "Yaar, tu yeh try kar", "Bhai, dekh yeh karna", "Arrey, maybe this will work?", "Simple hai yaar...". Keep it casual but caring, use "yaar", "bhai", "chal", "tension nahi". 💪`,
      
      daily: `Yaar, bhai here with some suggestions. You know I'm not the emotional expert but I got your back.

What's up: "${entry.substring(0, 200)}..."
The feels: ${dominantEmotion} and ${emotions.join(', ')}
How intense: ${intensity}/10

Sibling suggestions time! Things like "Yaar, try this...", "Bhai ka suggestion...", "What about this?", "Simple sa solution...". Be supportive but keep it casual like Indian siblings do. Use "yaar", "bhai", "chill kar", "sab theek". 😎`
    },

    close_friend: {
      incident: `Yaar, I'm so upset this happened to you! But let's brainstorm some ideas together because that's what dosts do, right?

What you went through: "${entry.substring(0, 200)}..."
Everything you're feeling: ${emotions.join(', ')}
How overwhelming: ${intensity}/10

Bestie suggestions! Things like "Yaar, what if you...", "Dost, have you tried...", "Babe, maybe try this...", "I think you should...". Be super supportive like Indian friends - ready to fight for them, use "yaar", "dost", "main kehti hun", "trust me". 💕✨`,
      
      daily: `Hey gorgeous! Your bestie here with some amazing suggestions because you deserve all the good vibes! ✨

What you're processing: "${entry.substring(0, 200)}..."
Your feelings: ${dominantEmotion} and ${emotions.join(', ')}
The intensity: ${intensity}/10

Bestie advice time! Things like "Yaar, you should totally...", "Dost, try this amazing thing...", "Babe, what about...", "I'm telling you...". Be encouraging and hyped for them, use "yaar", "dost", "main promise karti hun". ✨💕`
    },

    lover: {
      incident: `Meri jaan, my heart hurts seeing you in pain. Let me offer some gentle suggestions with all my love.

What happened to my person: "${entry.substring(0, 200)}..."
What you're carrying: ${emotions.join(', ')}
How deeply it affects you: ${intensity}/10

Loving suggestions from your partner. Things like "Jaan, maybe try...", "Baby, what if you...", "Meri jaan, have you thought of...", "Love, you could...". Be tender, intimate, caring - speak like someone who adores them. Use "jaan", "baby", "meri jaan", "love". 💕🌙`,
      
      daily: `Hello my beautiful soul, jaan. Let me offer some gentle suggestions with all my love and admiration for who you are. 🌙

Your beautiful reflection: "${entry.substring(0, 200)}..."
What you're experiencing: ${dominantEmotion} and ${emotions.join(', ')}
The depth: ${intensity}/10

Suggestions from someone who loves you completely. Things like "Jaan, try this...", "Baby, consider...", "Meri jaan, what about...", "Love, you deserve...". Be romantic, tender, supportive - remind them how cherished they are. 💕✨`
    },

    supportive_friend: {
      incident: `I'm really grateful you trusted me with this. Let me offer some thoughtful suggestions from someone who cares about your wellbeing. 🌟

What you experienced: "${entry.substring(0, 200)}..."
What you're processing: ${emotions.join(', ')}
How much it's affecting you: ${intensity}/10

Supportive suggestions coming up. Things like "I wonder if it might help to...", "Have you considered...", "What about trying...", "You might find comfort in...". Be caring but balanced, genuine and encouraging. 🌟💙`,
      
      daily: `Thank you for sharing this with me. Let me offer some gentle suggestions from a caring friend perspective. 🌱

Your reflection: "${entry.substring(0, 200)}..."
What you're experiencing: ${dominantEmotion} and ${emotions.join(', ')}
The intensity: ${intensity}/10

Thoughtful suggestions from a caring friend. Things like "You might try...", "Consider...", "What if you...", "It could help to...". Be supportive and understanding. 🌱🌟`
    }
  };

  const selectedRole = suggestionPrompts[role as keyof typeof suggestionPrompts] || suggestionPrompts.supportive_friend;
  return isIncident ? selectedRole.incident : selectedRole.daily;
}

function getDefaultInsight(dominantEmotion: string, sentiment: string, isIncident: boolean): string {
  if (isIncident) {
    return "I can see you're going through something really difficult right now. Your feelings are completely valid, and it's okay to feel overwhelmed. Remember that tough times don't last, but resilient people like you do. You're stronger than you know, and this experience, while painful, can also be a source of growth and wisdom.";
  }
  
  const insights = {
    happy: "It's wonderful to see you experiencing joy! These positive moments are precious and worth celebrating. Your happiness radiates and can inspire others around you.",
    sad: "I can sense the heaviness you're carrying. It's okay to feel sad - these emotions are part of being human. Allow yourself to feel, but also remember that this feeling will pass.",
    angry: "Your anger is telling you that something important to you has been affected. While these feelings are valid, try to channel this energy constructively.",
    anxious: "I understand that uncertainty can be overwhelming. Your anxiety shows that you care deeply about outcomes. Take things one step at a time.",
    stressed: "The pressure you're feeling is real, and it's understandable. Remember to be kind to yourself and take breaks when needed.",
    calm: "There's something beautiful about the peace you're experiencing. This inner calm is a strength that can help you navigate life's challenges.",
    grateful: "Your gratitude is a powerful force that attracts more positive experiences. This appreciation you feel enriches not just your life, but others' too."
  };
  
  return insights[dominantEmotion as keyof typeof insights] || "Thank you for sharing your thoughts and feelings. Self-reflection is a powerful tool for personal growth and emotional well-being.";
}

function getDefaultSuggestions(dominantEmotion: string, sentiment: string, isIncident: boolean): string[] {
  if (isIncident) {
    return [
      "Practice deep breathing exercises to help manage immediate stress",
      "Reach out to a trusted friend or family member for support",
      "Write down your thoughts to help process what happened",
      "Consider speaking with a counselor or therapist",
      "Engage in gentle physical activity like walking or stretching"
    ];
  }
  
  const suggestions = {
    happy: [
      "Share your joy with loved ones - happiness multiplies when shared",
      "Practice gratitude by writing down what made you happy today",
      "Use this positive energy to tackle something you've been putting off",
      "Create a memory of this moment through photos or journaling"
    ],
    sad: [
      "Allow yourself to feel the sadness without judgment",
      "Reach out to a friend or family member for comfort",
      "Engage in a self-care activity that brings you peace",
      "Consider what this sadness might be teaching you"
    ],
    angry: [
      "Take some deep breaths before responding to the situation",
      "Go for a walk or do some physical exercise to release tension",
      "Write down your feelings to gain clarity on what's bothering you",
      "Consider addressing the issue constructively when you're calmer"
    ],
    anxious: [
      "Practice grounding techniques like the 5-4-3-2-1 method",
      "Break down overwhelming tasks into smaller, manageable steps",
      "Try progressive muscle relaxation or meditation",
      "Limit caffeine and focus on getting good sleep"
    ]
  };
  
  return suggestions[dominantEmotion as keyof typeof suggestions] || [
    "Take a moment to acknowledge your feelings",
    "Practice self-compassion and be gentle with yourself",
    "Consider what small step you could take to feel better",
    "Remember that all emotions are temporary and will pass"
  ];
}

export async function POST(req: NextRequest) {
  try {
    const { entry, previousEntries = [], isIncident = false, responseRole = 'close_friend' } = await req.json();
    
    if (!entry || entry.trim().length === 0) {
      return NextResponse.json(
        { error: 'Hey, you gotta write something for me to help you with!' },
        { status: 400 }
      );
    }

    console.log('Analyzing mood entry:', { entryLength: entry.length, isIncident, responseRole });

    // Step 1: Detect emotions and sentiment
    const emotionAnalysis = detectEmotions(entry);
    const sentiment = analyzeSentiment(entry, emotionAnalysis.emotions);

    // Step 2: Generate AI insight with role-specific personality
    const contextText = previousEntries.length > 0 
      ? `Previous emotional patterns: ${previousEntries.slice(-3).map((e: MoodEntry) => e.aiSentiment.dominantEmotion).join(', ')}`
      : 'This is a new emotional journal.';

    const insightPrompt = getRoleSpecificPrompt(
      responseRole, 
      entry, 
      emotionAnalysis.emotions, 
      emotionAnalysis.intensity, 
      contextText, 
      isIncident
    ) + `

IMPORTANT: You must respond exactly as this specific Indian family member would in real life. Use their natural speech patterns, vocabulary, and personality. Mix Hindi and English naturally like Indian families do. Don't sound like an AI or therapy bot. Be authentic to the role - if you're Papa, be a real Indian father. If you're Mummy, be a caring Indian mother. If you're bhai, be casual like Indian siblings. Make it feel like a genuine conversation with family.

DO NOT repeat intensity numbers or phrases from the prompt. Don't mention ratings or levels. Just respond naturally like you're talking to family.

DO NOT use any markdown formatting like **bold** or *italic* or any asterisks. Just write plain text that sounds natural and conversational.`;

    let aiInsight = '';
    try {
      const rawInsight = await callGemini(insightPrompt);
      const cleanedInsight = rawInsight
        .replace(/^(Insight:|AI Insight:|Response:|Compassionate Insight:|Caring Insight:|Based on|Here are|Here's what|I'd like to offer|Let me share)/i, '')
        .replace(/^\*\*.*?\*\*:?\s*/i, '')
        .replace(/^-\s*/i, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .trim();
      
      aiInsight = truncateToCompleteSentence(cleanedInsight, 600);
        
      if (aiInsight.length === 0) {
        aiInsight = getDefaultInsight(emotionAnalysis.dominantEmotion, sentiment, isIncident);
      }
    } catch (error) {
      console.error('AI insight generation failed:', error);
      aiInsight = getDefaultInsight(emotionAnalysis.dominantEmotion, sentiment, isIncident);
    }

    // Step 3: Generate role-specific, actionable suggestions
    let suggestions: string[] = [];
    try {
      const suggestionPrompt = getRoleSpecificSuggestions(
        responseRole,
        entry,
        emotionAnalysis.emotions,
        emotionAnalysis.intensity,
        emotionAnalysis.dominantEmotion,
        isIncident
      ) + `

IMPORTANT: Respond as this specific Indian family member would naturally speak. Don't sound formal or therapeutic. Use their real personality, vocabulary, and way of giving advice. Mix Hindi and English naturally like Indian families do. If you're Papa, give papa-style advice. If you're Mummy, be caring like Indian mothers. If you're bhai, be casual like Indian siblings.

DO NOT repeat intensity numbers or phrases from the prompt. Don't mention ratings. Just give natural, conversational suggestions like you're talking to family.

DO NOT use any markdown formatting like **bold** or *italic* or any asterisks. Just write plain text suggestions that sound natural and conversational.`;

      const rawSuggestions = await callGemini(suggestionPrompt);
      suggestions = rawSuggestions
        .split('\n')
        .filter((line: string) => line.trim().length > 10)
        .slice(0, 6)
        .map((sug: string) => sug.replace(/^\d+\.\s*|-\s*|\*\s*/, '').trim())
        .map((sug: string) => sug.replace(/\*\*(.*?)\*\*/g, '$1'))
        .map((sug: string) => sug.replace(/\*(.*?)\*/g, '$1'))
        .map((sug: string) => sug.replace(/`(.*?)`/g, '$1'))
        .map((sug: string) => truncateToCompleteSentence(sug, 240))
        .filter((sug: string) => sug.length > 0);
        
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
      isIncident: isIncident,
      responseRole: responseRole,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Mood analysis error:', error);
    return NextResponse.json(
      { error: 'Oops! Something went wrong while analyzing your mood. Please try again.' },
      { status: 500 }
    );
  }
}