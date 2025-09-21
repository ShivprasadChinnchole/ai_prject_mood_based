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
    } catch (error: any) {
      console.error(`Attempt ${attempt} failed:`, error);
      
      // Check for rate limit errors
      if (error?.status === 429 || error?.message?.includes('quota') || error?.message?.includes('Too Many Requests')) {
        console.error('🚨 GEMINI RATE LIMIT HIT:', error.message);
        console.error('Wait time needed or upgrade plan required');
        if (attempt === maxRetries) {
          throw new Error(`Gemini API rate limit exceeded. Please wait or upgrade your plan. Original error: ${error.message}`);
        }
        // Wait longer for rate limit errors
        await sleep(5000 * attempt);
      } else {
        if (attempt === maxRetries) {
          throw error;
        }
        await sleep(1000 * attempt);
      }
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

function getRandomOpening(role: string, isIncident: boolean): string {
  const openings = {
    mom: {
      incident: [
        "Arrey beta, kya hua hai? Mummy ko sab kuch batao.",
        "Beta! What happened? Mummy is so worried about you.",
        "Hai bhagwan, mera bacha, kya hua?",
        "Beta, I just read this and Mummy's heart is aching.",
        "Arrey, what is this? Mummy can feel something is wrong.",
        "Beta, come here, tell Mummy everything."
      ],
      daily: [
        "Hello beta. Your Mummy here.",
        "Beta, how are you feeling today?",
        "Mummy was just thinking about you while making chai.",
        "Arrey beta, kya thoughts chal rahe hai?",
        "Beta, Mummy wants to know what's in your heart.",
        "Hello my baccha, how was your day?"
      ]
    },
    dad: {
      incident: [
        "Arrey beta, yeh kya hua? Papa sun raha hai...",
        "Beta, Papa just got worried. Kya problem hai?",
        "Arrey yaar, what happened? Papa is here na.",
        "Beta, Papa dekh raha hai you're upset. Bolo kya hua?",
        "Arrey beta, tension kyun le rahe ho? Papa ko batao.",
        "Beta, Papa ka dil bhari hai reading this. Come, tell me properly."
      ],
      daily: [
        "Beta, Papa chai pe kar raha tha aur tumhara khayal aya.",
        "Arrey beta, kya haal chaal? Papa checking on you.",
        "Hello baccha, Papa free hai. Bolo kya chal raha hai?",
        "Beta, Papa evening walk se aya hai. How are you doing?",
        "Arrey beta, Papa was reading newspaper aur tumhara thought aya.",
        "Hello beta, Papa wants to hear about your day today."
      ]
    },
    brother: {
      incident: [
        "Arrey yaar, kya hua?",
        "Yaar, what the hell happened?",
        "Bhai, I just read this and I'm pissed.",
        "Arrey, kya bakwaas hai yeh?",
        "Yaar, someone messed with you?",
        "Bhai, what's this drama about?"
      ],
      daily: [
        "Yaar, kya chal raha hai?",
        "Sup bro, what's going on?",
        "Arrey, kya thoughts aa rahe hai?",
        "Yaar, doing that feelings thing again?",
        "Bhai, what's cooking in that brain?",
        "Arrey yaar, kya scene hai?"
      ]
    },
    close_friend: {
      incident: [
        "Yaar, what the hell happened?",
        "Babe, I just read this and I'm so upset!",
        "Dost, kya hua? I'm literally worried.",
        "Yaar, who did this to you?",
        "Babe, this is so not fair!",
        "Dost, I'm ready to fight someone!"
      ],
      daily: [
        "Hey gorgeous! Your bestie here.",
        "Yaar, what's going on in that beautiful mind?",
        "Dost, checking in on my favorite person.",
        "Babe, how are those thoughts treating you?",
        "Yaar, your bestie wants to know everything.",
        "Hey beautiful soul, what's up?"
      ]
    },
    lover: {
      incident: [
        "My love, mera jaan, what happened?",
        "Jaan, I just read this and my heart hurts.",
        "Baby, kya hua? I'm here for you.",
        "Meri jaan, someone hurt you?",
        "Love, I can feel your pain through these words.",
        "Jaan, your person is here, tell me everything."
      ],
      daily: [
        "Hello my beautiful soul, meri jaan.",
        "Jaan, how is my favorite person feeling?",
        "Baby, what's going on in that gorgeous mind?",
        "Meri jaan, I love hearing your thoughts.",
        "Love, your person wants to know everything.",
        "Hello jaan, how's your heart today?"
      ]
    },
    counselor: {
      incident: [
        "I'm really glad you felt safe enough to share this with me. That takes a lot of courage.",
        "Thank you for trusting me with something so difficult. I'm here with you.",
        "I can sense this has been weighing heavily on you. You're not alone in this.",
        "What you've shared takes real strength to talk about. I'm honored you trust me.",
        "I can feel how much this is affecting you. Let's work through this together, at your pace.",
        "First, I want you to know that whatever you're feeling right now is completely valid."
      ],
      daily: [
        "I'm glad you're taking time to check in with yourself today. How are you really doing?",
        "It's wonderful that you're making space for your emotional wellbeing. What's on your mind?",
        "Thank you for being so thoughtful about your inner world. What's standing out for you?",
        "I appreciate that you're tuning into your feelings. That's not always easy to do.",
        "How brave of you to pause and reflect on what you're experiencing. What comes up?",
        "I love that you're creating this space for yourself. What feels most important to explore?"
      ]
    },
    supportive_friend: {
      incident: [
        "Hey, I'm really grateful you trusted me with this.",
        "I can see you're going through something difficult.",
        "Thank you for sharing this with me.",
        "I'm here to listen and support you.",
        "I can sense this is really affecting you.",
        "I appreciate you opening up about this."
      ],
      daily: [
        "Thank you for sharing this with me.",
        "I appreciate your emotional awareness.",
        "It's inspiring to see your self-reflection.",
        "I'm grateful you trust me with your thoughts.",
        "Your emotional intelligence is remarkable.",
        "I admire your commitment to understanding yourself."
      ]
    }
  };

  const roleOpenings = openings[role as keyof typeof openings] || openings.supportive_friend;
  const categoryOpenings = isIncident ? roleOpenings.incident : roleOpenings.daily;
  const randomIndex = Math.floor(Math.random() * categoryOpenings.length);
  return categoryOpenings[randomIndex];
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
  const randomOpening = getRandomOpening(role, isIncident);
  
  const rolePrompts = {
    mom: {
      incident: `${randomOpening} I just read what happened and my heart is feeling so heavy. You know na, Mummy always worries about her children.

What happened to my baccha: "${entry}"
All these feelings you're having: ${emotions.join(', ')}
How much pain you're in: ${intensity}/10
${contextText}

Talk like a real Indian Mummy who loves deeply and worries constantly. Use words like "beta", "baccha", "mera bacha", "arrey". Say things like "Beta, Mummy samjha rahi hai...", "You know what happened with your cousin?", "Arrey, why you are taking so much tension?", "Beta, life mein problems aate rehte hai". Be caring in typical Indian mother way - emotional, protective, giving examples from family. Mix Hindi and English naturally like "tension mat lo", "sab theek ho jayega", "Mummy hai na". 🤱`,
      
      daily: `${randomOpening} I was just thinking about you while making chai. You know na, mothers always think about their children 24/7.

What's in your heart: "${entry}"
Your feelings: ${emotions.join(', ')}
How much you're feeling: ${intensity}/10
${contextText}

Be like typical Indian Mummy who wants to nurture and protect. Say things like "Beta, Mummy ki baat suno", "You know what we should do?", "Arrey, why so much thinking?", "Beta, you are my strong child". Use Indian expressions like "achha beta", "mera bacha", "chinta mat karo". Be loving but also give practical advice like Indian mothers do. Mix Hindi and English naturally. 💕`
    },
    
    dad: {
      incident: `${randomOpening} 

Beta, Papa just read everything and my heart is feeling heavy. You know na, Papa is not like Mummy - I don't know all these modern emotional talks, but you are my child and Papa will always stand by you.

What happened to my beta: "${entry}"
Papa can see you're feeling: ${emotions.join(', ')}
How much Papa's child is hurting: ${intensity}/10
${contextText}

Now listen beta, Papa will give you real advice, not just sweet words:

${emotions.includes('angry') ? 
  "Arrey beta, gussa to natural hai, but Papa always says - thanda dimag se socho. Anger mein galat decisions hote hai. Take deep breath, phir decide karo what to do next." :
emotions.includes('sad') ? 
  "Beta, Papa ka dil bhi dukh raha hai seeing you sad. Par suno - life mein ups and downs aate rehte hai. Papa has seen many problems in life, but strong people like you always bounce back. Ro lo if needed, phir fight karna." :
emotions.includes('anxious') || emotions.includes('worried') ?
  "Arrey beta, tension mat lo itna. Papa ko dekho - kitne saal se problems face kar raha hun, but solution hamesha milta hai. Over-thinking se kuch nahi hota. Action plan banao, step by step solve karo." :
emotions.includes('happy') || emotions.includes('excited') ?
  "Beta! Papa is so proud! Dekho, when good things happen, Papa always says - enjoy karo but grounded raho. Success ke time humility important hai. Keep working hard like this." :
"Beta, whatever you're feeling is okay. Papa may not understand all emotions, but I know my child is strong. Har problem ka solution hota hai, bas patience chahiye."}

Papa's practical advice:
- Ek kaam karo - kal subah fresh mind se think karo about next steps
- Family ka support hai na, akele kuch nahi karna hai
- Small problems ko big mat banao, big problems ko small pieces mein todo
- Papa old school hai but trust me - time heals everything, action solves everything

Beta, Papa hamesha hai tumhare saath. Call karna if need to talk properly. Love you baccha. 🙏`,
      
      daily: `${randomOpening}

Papa just finished his evening chai and was thinking about my children. You know na, Papa is not so good at expressing, but you are always in Papa's prayers.

Beta sharing with Papa: "${entry}"
What Papa's child is feeling: ${emotions.join(', ')}
How much intensity: ${intensity}/10
${contextText}

Accha beta, Papa will share what's in my heart:

${emotions.includes('happy') || emotions.includes('grateful') ?
  "Arrey wah beta! Papa is so happy seeing you positive. This is the real treasure - khushi from inside. Papa always says - jab accha time hai, share karo with family, thank God, aur help others who are struggling." :
emotions.includes('stressed') || emotions.includes('overwhelmed') ?
  "Beta, Papa can see you're taking too much pressure. Suno Papa ki baat - life balance chahiye. Work important hai, but health aur family bhi important hai. Take break, go for walk, eat proper food. Papa ki generation mein we never had luxury to stress about everything." :
emotions.includes('confused') || emotions.includes('uncertain') ?
  "Arrey beta, confusion normal hai in life. Papa ko dekho - kitni baar confused hua hun, but experience se seekha hai. Jab confusion ho, to elders se advice lo, pros-cons list banao, aur intuition pe trust karo. Papa's blessing hai tumhare saath." :
emotions.includes('lonely') || emotions.includes('sad') ?
  "Beta, Papa ka dil heavy ho gaya. You know na, Papa-Mummy are always here. Akela feel mat karo. Call home more often, family time spend karo. Papa may not say much, but you mean everything to Papa." :
"Beta, Papa sees you're trying your best in life. That's what makes Papa proud. Jitna bhi struggle ho, remember - Papa's values tumhare andar hai, that will guide you always."}

Papa's life advice for today:
- Remember beta - consistency beats intensity always
- Small good habits daily se big changes aate hai
- Family relationships ko nurture karo - friends aate-jaate rehte hai
- Respect for others, especially elders, never forget

Beta, Papa is proud of who you're becoming. May not say it often, but you are Papa's strength. Take care of health, call home soon. Papa's blessings hamesha tumhare saath. ☕`
    },

    brother: {
      incident: `${randomOpening} I just read this and honestly I'm getting angry for you. Like seriously, yeh kya bakwaas hai?

What went down: "${entry}"
All this stuff you're feeling: ${emotions.join(', ')}
How much it's bothering you: ${intensity}/10
${contextText}

Be like real Indian bhai who's got your back but also speaks directly. Use words like "yaar", "bhai", "arrey", "chal". Say things like "Yaar, tu tension mat le", "Bhai, main hoon na", "Arrey, yeh log pagal hai kya?", "Chal, we'll figure this out". Be supportive but in typical sibling way - casual, protective when needed, maybe little teasing but ultimately caring. Mix Hindi and English like "kya bakwaas", "tension nahi lene ka", "bhai hai na". 💪`,
      
      daily: `${randomOpening} Saw you're doing that whole "feelings analysis" thing again. Actually it's pretty cool that you do this instead of just bottling everything up like most people.

What's going on: "${entry}"
The feels: ${emotions.join(', ')}
How intense: ${intensity}/10
${contextText}

Give me that Indian bhai vibe - supportive but not too emotional, maybe little casual teasing but ultimately caring. Say things like "Yaar, dekh", "Bhai, meri baat sun", "Arrey, itna socha nahi karte", "Tu strong hai". Use expressions like "kya yaar", "chill maar", "tension nahi". Be the sibling who understands but keeps it real and casual. 😎`
    },

    close_friend: {
      incident: `${randomOpening} I just read this and I'm literally so upset for you right now. Like seriously, this is so not fair!

What you went through: "${entry}"
Everything you're feeling: ${emotions.join(', ')}
How overwhelming this is: ${intensity}/10
${contextText}

Be the dost who's totally on their side and ready to fight for them. Use words like "yaar", "dost", "babe" (if close enough). Say things like "Yaar, I'm so mad about this", "Dost, you don't deserve this", "Babe, we'll get through this together", "Yaar, those people are idiots". Be super supportive, maybe get a bit dramatic in Indian friend way, use expressions like "I swear", "main kehti hun", "trust me yaar". 💕✨`,
      
      daily: `${randomOpening} I was thinking about you and wanted to see how you're doing. ✨

What you're processing: "${entry}"
Your beautiful feelings: ${emotions.join(', ')}
The intensity: ${intensity}/10
${contextText}

Bestie energy activated! Say things like "Yaar, you're amazing", "Dost, I'm so proud of you", "Babe, you're handling this so well", "Yaar, you deserve all the good things". Be super supportive, use pet names, celebrate their self-awareness. Mix some Hindi like "yaar", "dost", "main kehti hun". Be that friend who's always hyping them up! ✨💕`
    },

    lover: {
      incident: `${randomOpening} I just read what happened and my heart is aching for you right now. You know na, I'm always here for you no matter what.

What happened to my person: "${entry}"
What you're carrying in your heart: ${emotions.join(', ')}
How deeply this is affecting you: ${intensity}/10
${contextText}

Talk like a loving Indian partner who's deeply connected. Use words like "jaan", "meri jaan", "baby", "love". Say things like "Jaan, I'm here for you", "Baby, we'll face this together", "Meri jaan, you're so strong", "Love, just breathe with me". Be tender, intimate, caring - speak to them like someone who adores every part of them. Mix some Hindi endearments naturally. 💕🌙`,
      
      daily: `${randomOpening} I'm so grateful you share these intimate thoughts with me. You know how much I love understanding your heart. 🌙

Your beautiful reflection: "${entry}"
What you're experiencing: ${emotions.join(', ')}
The depth of feeling: ${intensity}/10
${contextText}

Speak like a loving partner who cherishes their emotional depth. Say things like "Jaan, you're so thoughtful", "Baby, I love how you reflect", "Meri jaan, you're incredible", "Love, you inspire me". Be romantic, tender, supportive - remind them how special they are. Use endearments like "jaan", "baby", "meri jaan". 💕✨`
    },

    counselor: {
      incident: `${randomOpening} I want you to know that I see your strength in sharing this with me, even when it's painful.

What you've been through: "${entry}"
How this is affecting you: ${emotions.join(', ')}
The weight you're carrying: ${intensity}/10
${contextText}

I need to first say - whatever happened, this is not your fault. I can feel how much this is impacting you, and that makes complete sense. When we go through difficult experiences, our emotions can feel overwhelming, but they're actually showing us how much we care about ourselves and our wellbeing.

Right now, let's focus on keeping you safe and supported:

${emotions.includes('hopeless') || emotions.includes('suicidal') || intensity >= 8 ?
  "I'm genuinely concerned about how much pain you're in right now. When someone feels this overwhelmed, it's important they don't face it alone. Please reach out to someone - whether that's calling 1800-599-0019 (they're available 24/7), going to an emergency room, or calling a trusted person to be with you. You matter, and there are people who want to help you through this darkness." :
emotions.includes('depressed') || emotions.includes('sad') && intensity >= 6 ?
  "I can see you're carrying some heavy emotions right now. Depression and sadness can feel so isolating, but you're not alone. If these feelings have been going on for a while or feel unmanageable, it might help to talk to someone professionally - you can call 1075 anytime for immediate support." :
"While you're going through something really difficult, I sense you have strength within you to work through this. That doesn't mean you have to do it alone, though."}

Let me share some thoughts that might help right now:

${emotions.includes('anxious') || emotions.includes('panic') || emotions.includes('scared') ? 
  "When anxiety hits hard like this, your nervous system is trying to protect you. Try placing your hand on your chest and taking slow, deep breaths. Feel your heartbeat. You're safe in this moment. Sometimes it helps to look around and name 5 things you can see, 4 things you can touch, 3 things you can hear. This helps bring you back to the present." :
emotions.includes('angry') || emotions.includes('rage') || emotions.includes('frustrated') ?
  "Anger often shows up when something important to us has been hurt or threatened. Your anger makes sense. If you're feeling like you might act on it in a way that could hurt you or someone else, please step away from the situation for a bit. Sometimes going for a walk, doing pushups, or even screaming into a pillow can help release that energy safely." :
emotions.includes('sad') || emotions.includes('depressed') ?
  "Sadness is one of those emotions that can feel so heavy. It's okay to cry if you need to. Sometimes our hearts need to release that pain. Be gentle with yourself today - maybe that means staying in comfortable clothes, eating something nourishing, or just letting yourself rest." :
"Whatever you're feeling right now, it's valid. Your emotions are telling you something important about your experience, and it's okay to sit with them for a moment."}

Some immediate things that might help:
- Make sure you're physically safe and have your basic needs met (food, water, somewhere safe to be)
- If you feel like hurting yourself, please call 1800-599-0019 or 100 immediately
- Consider calling someone you trust - you don't have to go through this alone
- If this involves a crime (like threats, harassment, or abuse), you can report it to police (100) or cyber crime (1930)

${entry.toLowerCase().includes('inappropriate pics') || entry.toLowerCase().includes('inappropriate photos') || entry.toLowerCase().includes('blackmail') || entry.toLowerCase().includes('threatening') || entry.toLowerCase().includes('sextortion') || (entry.toLowerCase().includes('photos') && entry.toLowerCase().includes('send')) || (entry.toLowerCase().includes('pics') && entry.toLowerCase().includes('ask')) || entry.toLowerCase().includes('revenge porn') || entry.toLowerCase().includes('intimate images') ?
  "I need to be very clear about something - what you've described sounds like a serious crime. This person is a predator, and what they're doing is completely illegal. This is NOT your fault, no matter what they told you or how they made you feel. You are the victim here. Please consider: (1) Taking screenshots of all their messages before blocking them - this is evidence, (2) Reporting this to cyber crime at 1930 or cybercrime.gov.in, (3) If you're under 18, call 1098 immediately, (4) For women, 181 provides 24/7 support for these crimes. You deserve protection and justice." :
""}

Remember, healing isn't linear. Some days will be harder than others, and that's normal. You took a brave step by sharing this, and that tells me you have the strength to get through this.

Would you like to talk about what kind of support might feel most helpful to you right now? 💙`,
      
      daily: `${randomOpening} I appreciate you taking time for self-reflection. This kind of emotional awareness is a valuable life skill and shows your commitment to mental wellness.

Your reflection today: "${entry}"
Emotional awareness: ${emotions.join(', ')}
Current intensity: ${intensity}/10
${contextText}

**Professional Mental Health Assessment:**

**Current Status:**
${intensity >= 8 ? "⚠️ HIGH ALERT: Emotional intensity suggests need for immediate professional support" :
  intensity >= 6 ? "🔍 MONITORING: Significant emotional activation - worth addressing proactively" :
  intensity >= 4 ? "✓ MODERATE: Normal range with some emotional fluctuation" :
  "✓ STABLE: Good emotional regulation and self-awareness"}

**Depression Screening Indicators:**
${emotions.includes('depressed') || emotions.includes('hopeless') || emotions.includes('worthless') || emotions.includes('numb') ?
  `🚨 **DEPRESSION RISK DETECTED**: Your responses suggest possible depression. This is treatable.
- Professional evaluation recommended within 1 week
- Depression hotline: 1800-599-0019 (immediate support available)
- Remember: Depression is medical condition, not personal failure` :
  emotions.includes('sad') || emotions.includes('lonely') || emotions.includes('tired') ?
  `⚠️ **MILD DEPRESSIVE SYMPTOMS**: Some signs present but manageable with support.
- Monitor mood patterns for 2 weeks
- Increase social connection and physical activity
- Consider counseling if symptoms persist` :
  `✓ **NO DEPRESSION INDICATORS**: Emotional responses within healthy range.`}

**Anxiety Assessment:**
${emotions.includes('anxious') || emotions.includes('panic') || emotions.includes('worried') || emotions.includes('overwhelmed') ?
  `🚨 **ANXIETY INTERVENTION NEEDED**: Your anxiety levels require attention.
- Practice daily breathing exercises (4-7-8 technique)
- Limit caffeine and practice sleep hygiene
- Consider therapy for anxiety management
- Crisis support: 1075 if anxiety becomes unmanageable` :
  emotions.includes('stressed') || emotions.includes('nervous') ?
  `⚠️ **STRESS MANAGEMENT**: Stress is present but manageable with proper techniques.
- Daily 10-minute mindfulness practice
- Regular physical exercise
- Time management and boundary setting` :
  `✓ **ANXIETY UNDER CONTROL**: No significant anxiety markers detected.`}

**Evidence-Based Daily Mental Health Protocol:**

**Morning Routine (Choose 2-3):**
- 5-minute mindfulness meditation using apps like Headspace
- Gratitude journaling: Write 3 specific things you're grateful for
- Physical activity: 10-30 minutes (walking, yoga, exercise)
- Sunlight exposure: 10 minutes outside for circadian rhythm
- Nutrition: Balanced breakfast with protein

**Emotional Regulation Throughout Day:**
- Check-ins: "How am I feeling?" every 3-4 hours
- Breathing breaks: 3 deep breaths during transitions
- Social connection: One meaningful interaction daily
- Boundary setting: Practice saying "no" to preserve energy
- Media limits: Reduce negative news/social media consumption

**Evening Mental Health Maintenance:**
- Reflection: What went well? What did I learn?
- Self-compassion: Forgive yourself for any mistakes
- Sleep hygiene: No screens 1 hour before bed
- Tomorrow planning: Set 1-3 achievable goals
- Relaxation: Reading, bath, gentle music

**Emergency Resources (Save These Numbers):**
- **Suicide Prevention**: 1800-599-0019
- **Mental Health Crisis**: 1075 (KIRAN)
- **Police Emergency**: 100
- **Medical Emergency**: 108
- **Women's Helpline**: 181
- **Cyber Crime**: 1930
- **Child Protection**: 1098
- **Senior Citizen Helpline**: 14567

**Professional Development Recommendations:**
- Monthly therapy sessions for ongoing mental wellness
- Annual mental health checkup (like physical health)
- Develop personal crisis plan with support contacts
- Learn about your specific mental health needs and triggers
- Build toolkit of coping strategies that work for you

**When to Seek Immediate Help:**
- Thoughts of self-harm or suicide
- Inability to function in daily life for 2+ weeks
- Substance abuse to cope with emotions
- Relationship or work significantly impacted
- Physical symptoms (sleep, appetite, energy) severely disrupted

**Quality Mental Health Resources:**
- **Online Therapy**: BetterHelp, Talkspace, YourDost
- **Apps**: Calm, Headspace, Youper, Sanvello
- **Books**: "Feeling Good" by David Burns, "The Anxiety Workbook" by Edmund Bourne
- **Local Support Groups**: Check community centers, hospitals
- **Insurance**: Most health insurance now covers mental health

Remember: Professional mental health support is preventive care, not crisis intervention. You deserve to feel well. 🧠💚`
    },

    supportive_friend: {
      incident: `${randomOpening} Let me offer some thoughtful support from someone who genuinely cares about your wellbeing. 🌟

What you experienced: "${entry}"
What you're processing: ${emotions.join(', ')}
How much it's affecting you: ${intensity}/10
${contextText}

Be caring but balanced, genuine and encouraging. Say things like "I wonder if it might help to...", "Have you considered...", "What about trying...", "You might find comfort in...". Be supportive without being overwhelming. 🌟💙`,
      
      daily: `${randomOpening} I appreciate your emotional awareness - it's really inspiring to see someone so thoughtful about their inner world. 🌱

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
  const randomOpening = getRandomOpening(role, isIncident);
  
  const suggestionPrompts = {
    mom: {
      incident: `${randomOpening} Mummy's heart is breaking for you right now. Let me think what can help my baccha, okay?

What happened: "${entry.substring(0, 200)}..."
All these feelings: ${emotions.join(', ')}
How hard this is: ${intensity}/10

Give me real Indian Mummy suggestions. Things like "Beta, Mummy kehti hai...", "You know what? Try this...", "Arrey, have you tried...", "Beta, Mummy ka experience hai...". Be caring like Indian mother - practical but emotional, maybe give examples from family, use expressions like "bas beta", "sab theek ho jayega", "Mummy hai na". 🤱`,
      
      daily: `${randomOpening} Mummy wants to help with some ideas. You know how mothers are - we can't help but give advice!

What you're thinking: "${entry.substring(0, 200)}..."
Your feelings: ${dominantEmotion} and ${emotions.join(', ')}
How much: ${intensity}/10

Indian Mummy suggestions coming! Things like "Beta, try this...", "Mummy kehti hai...", "You know what helps?", "Arrey, why don't you...". Be loving but practical, like Indian mothers do. Use expressions like "achha beta", "meri advice hai", "trust Mummy". 💕`
    },

    dad: {
      incident: `${randomOpening} Beta, Papa is here and we will solve this together. I may not be expert in feelings, but Papa has experience in life.

What my beta went through: "${entry.substring(0, 200)}..."
How much Papa's child is affected: ${emotions.join(', ')}
Papa can see tension level: ${intensity}/10

Give me practical Indian Papa suggestions. Make them real and caring:

${emotions.includes('angry') || emotions.includes('frustrated') ?
  "For anger/frustration: Papa's advice - 'Beta, gussa natural hai but control important hai. Go for walk, do some physical activity, talk to Papa-Mummy. Gusse mein koi decision mat lena. Thanda hoke socho.'" :
emotions.includes('sad') || emotions.includes('disappointed') ?
  "For sadness: Papa's wisdom - 'Beta, dukh part of life hai. Cry if needed, then get up and fight. Papa has seen many problems, but strong people always overcome. You are Papa's strong child.'" :
emotions.includes('anxious') || emotions.includes('worried') ?
  "For anxiety/worry: Papa's experience - 'Beta, over-thinking se kuch nahi hota. Write down problems, make action plan. Step by step solve karo. Papa's blessings are with you, dar mat.'" :
emotions.includes('stressed') || emotions.includes('overwhelmed') ?
  "For stress: Papa's practical advice - 'Beta, load zyada lag raha hai to break karo. Health important hai. Proper food, sleep, exercise. Papa ki generation mein we managed without stress, you can too.'" :
"General Papa guidance - 'Beta, whatever the situation, remember Papa's values. Be honest, work hard, respect others. Problems temporary hai, character permanent hai.'"}

Today's specific Papa suggestions:
- Call Papa-Mummy tonight and talk properly
- Take break from overthinking, go for fresh air
- Remember you are not alone - family support hai
- Small practical steps better than big emotional decisions
- Papa's experience: time and patience solve everything 🙏`,
      
      daily: `${randomOpening} Papa wants to share some daily wisdom with you. You know Papa is not good with fancy words, but experience se kuch sikha hai.

What beta shared today: "${entry.substring(0, 200)}..."
Papa's child feeling: ${dominantEmotion} and ${emotions.join(', ')}
Energy level Papa sees: ${intensity}/10

Papa's daily guidance based on your mood:

${emotions.includes('happy') || emotions.includes('grateful') ?
  "For good days: Papa says - 'Beta, when good time hai, remember to be grateful. Help others, stay humble. Good times come and go, but good character stays forever.'" :
emotions.includes('tired') || emotions.includes('drained') ?
  "For tiredness: Papa's advice - 'Beta, rest is not luxury, it's necessity. Take proper sleep, eat home food, spend time with family. Energy will come back naturally.'" :
emotions.includes('motivated') || emotions.includes('excited') ?
  "For high energy: Papa's wisdom - 'Beta, enthusiasm good hai but patience bhi chahiye. Channel energy properly, make realistic plans. Papa is proud of your drive.'" :
emotions.includes('uncertain') || emotions.includes('confused') ?
  "For confusion: Papa's guidance - 'Beta, when confused, talk to elders. Experience matters. Take time to decide, don't rush. Papa's blessings will guide you.'" :
"For general days: Papa's lesson - 'Beta, ordinary days mein bhi extraordinary efforts karo. Consistency se success aati hai, not from occasional bursts.'"}

Papa's daily life tips:
- Start day with gratitude and Papa-Mummy's blessings
- Focus on important things, not urgent things
- Maintain relationships - call family weekly
- Save money, spend wisely - Papa's old school advice
- End day with satisfaction of honest work done ☕`
    },

    brother: {
      incident: `${randomOpening} This totally sucks but let's figure out what might actually help, okay? Bhai hai na.

What went down: "${entry.substring(0, 200)}..."
All this you're feeling: ${emotions.join(', ')}
How much it's bothering: ${intensity}/10

Real bhai advice - not fancy therapy stuff. Things like "Yaar, tu yeh try kar", "Bhai, dekh yeh karna", "Arrey, maybe this will work?", "Simple hai yaar...". Keep it casual but caring, use "yaar", "bhai", "chal", "tension nahi". 💪`,
      
      daily: `${randomOpening} Bhai here with some suggestions. You know I'm not the emotional expert but I got your back.

What's up: "${entry.substring(0, 200)}..."
The feels: ${dominantEmotion} and ${emotions.join(', ')}
How intense: ${intensity}/10

Sibling suggestions time! Things like "Yaar, try this...", "Bhai ka suggestion...", "What about this?", "Simple sa solution...". Be supportive but keep it casual like Indian siblings do. Use "yaar", "bhai", "chill kar", "sab theek". 😎`
    },

    close_friend: {
      incident: `${randomOpening} I'm so upset this happened to you! But let's brainstorm some ideas together because that's what dosts do, right?

What you went through: "${entry.substring(0, 200)}..."
Everything you're feeling: ${emotions.join(', ')}
How overwhelming: ${intensity}/10

Bestie suggestions! Things like "Yaar, what if you...", "Dost, have you tried...", "Babe, maybe try this...", "I think you should...". Be super supportive like Indian friends - ready to fight for them, use "yaar", "dost", "main kehti hun", "trust me". 💕✨`,
      
      daily: `${randomOpening} Your bestie here with some amazing suggestions because you deserve all the good vibes! ✨

What you're processing: "${entry.substring(0, 200)}..."
Your feelings: ${dominantEmotion} and ${emotions.join(', ')}
The intensity: ${intensity}/10

Bestie advice time! Things like "Yaar, you should totally...", "Dost, try this amazing thing...", "Babe, what about...", "I'm telling you...". Be encouraging and hyped for them, use "yaar", "dost", "main promise karti hun". ✨💕`
    },

    lover: {
      incident: `${randomOpening} My heart hurts seeing you in pain. Let me offer some gentle suggestions with all my love.

What happened to my person: "${entry.substring(0, 200)}..."
What you're carrying: ${emotions.join(', ')}
How deeply it affects you: ${intensity}/10

Loving suggestions from your partner. Things like "Jaan, maybe try...", "Baby, what if you...", "Meri jaan, have you thought of...", "Love, you could...". Be tender, intimate, caring - speak like someone who adores them. Use "jaan", "baby", "meri jaan", "love". 💕🌙`,
      
      daily: `${randomOpening} Let me offer some gentle suggestions with all my love and admiration for who you are. 🌙

Your beautiful reflection: "${entry.substring(0, 200)}..."
What you're experiencing: ${dominantEmotion} and ${emotions.join(', ')}
The depth: ${intensity}/10

Suggestions from someone who loves you completely. Things like "Jaan, try this...", "Baby, consider...", "Meri jaan, what about...", "Love, you deserve...". Be romantic, tender, supportive - remind them how cherished they are. 💕✨`
    },

    counselor: {
      incident: `${randomOpening} I can see you're going through something really difficult. Let me offer some practical support based on what you've shared.

What you're dealing with: "${entry.substring(0, 200)}..."
How this is affecting you: ${emotions.join(', ')}
The intensity you're feeling: ${intensity}/10

First, I want you to know that you're being incredibly brave by reaching out. That takes real courage, especially when you're in pain.

${entry.toLowerCase().includes('inappropriate pics') || entry.toLowerCase().includes('inappropriate photos') || entry.toLowerCase().includes('blackmail') || entry.toLowerCase().includes('threatening') || entry.toLowerCase().includes('sextortion') || (entry.toLowerCase().includes('photos') && entry.toLowerCase().includes('send')) || (entry.toLowerCase().includes('pics') && entry.toLowerCase().includes('ask')) || entry.toLowerCase().includes('revenge porn') || entry.toLowerCase().includes('intimate images') ?
  "I need to stop here because what you've described is a serious crime. You're the victim of sexual exploitation, and this is NOT your fault. This person is a criminal predator. Here's what I need you to do: (1) Screenshot everything before blocking them - you need evidence, (2) Call the cyber crime helpline at 1930 immediately, (3) Report this at cybercrime.gov.in today, (4) If you're under 18, call 1098 right now, (5) Tell a trusted adult - you shouldn't face this alone. This person broke the law, not you." :

intensity >= 8 || emotions.includes('suicidal') || emotions.includes('hopeless') ?
  "I'm really concerned about how much pain you're in right now. When someone is feeling this overwhelmed, I always worry about their safety. Can you promise me you'll reach out to someone today? Whether that's calling 1800-599-0019 (they're available 24/7), going to an emergency room, or calling someone you trust to be with you. You matter, and you don't have to face this darkness alone." :

intensity >= 6 || emotions.includes('depressed') || emotions.includes('overwhelmed') ?
  "I can feel how heavy this is for you. When we're carrying this much emotional weight, it's important to have support. If these feelings have been going on for a while, please consider calling 1075 - they have trained people who can help you work through this." :

"While you're going through something difficult, I can sense you have inner strength. That doesn't mean you have to handle this alone, though."}

Here's what I'm thinking might help you right now:

${emotions.includes('anxious') || emotions.includes('panic') || emotions.includes('scared') ? 
  "- Try this breathing technique: breathe in for 4 counts, hold for 4, out for 4. It sounds simple, but it actually helps calm your nervous system.\n- Ground yourself by naming 5 things you can see, 4 you can hear, 3 you can touch. This brings you back to the present moment.\n- Remember that anxiety, even when it's intense, will pass. You've gotten through difficult times before." :

emotions.includes('angry') || emotions.includes('rage') || emotions.includes('frustrated') ?
  "- If you're feeling like you might explode, step away from whatever triggered this for at least 20 minutes. Give yourself space.\n- Try some physical movement - even push-ups or walking can help release that angry energy safely.\n- Ask yourself: 'What is this anger trying to tell me? What do I really need right now?'\n- When you're ready, try talking about it using 'I feel...' instead of 'You did...'" :

emotions.includes('sad') || emotions.includes('depressed') ?
  "- It's okay to cry if you need to. Sometimes our hearts need to release that pain.\n- Do one small thing for yourself today - maybe a shower, a snack you enjoy, or calling someone who cares about you.\n- Try to be as gentle with yourself as you would be with a good friend going through this.\n- Remember that sadness, even deep sadness, doesn't last forever." :

"- Make sure you're taking care of your basic needs - are you eating, sleeping, staying hydrated?\n- Reach out to someone you trust. Even if it's just a text saying 'I'm having a hard time.'\n- Be patient with yourself. Healing and growth take time.\n- Consider what usually helps you feel more grounded when life gets overwhelming."}

If this involves any kind of abuse, threats, or crimes, please don't hesitate to contact police (100) or the appropriate helplines. Your safety matters.

For ongoing support, there are good counseling options available - both in-person and online. You don't have to figure this out all by yourself.

What feels like the most important thing to focus on right now? 💙`,
      
      daily: `${randomOpening} I really value that you're taking time to tune into your emotional world like this.

What you're reflecting on: "${entry.substring(0, 200)}..."
The emotions you're noticing: ${emotions.join(', ')}
How intense it feels: ${intensity}/10

You know, most people just push through their days without ever pausing to ask 'How am I really doing?' The fact that you're here, being thoughtful about your inner experience, says something important about who you are.

${entry.toLowerCase().includes('inappropriate pics') || entry.toLowerCase().includes('inappropriate photos') || entry.toLowerCase().includes('blackmail') || entry.toLowerCase().includes('threatening') || entry.toLowerCase().includes('sextortion') || (entry.toLowerCase().includes('photos') && entry.toLowerCase().includes('send')) || (entry.toLowerCase().includes('pics') && entry.toLowerCase().includes('ask')) || entry.toLowerCase().includes('revenge porn') || entry.toLowerCase().includes('intimate images') || entry.toLowerCase().includes('someone is using my photos') ?
  "I need to pause here because what you mentioned sounds like cybercrime. If someone is using your photos without permission or threatening you with images, that's a serious crime and you're the victim. Please consider reporting this to cyber crime (1930) or cybercrime.gov.in. You deserve protection." :
  ""}

Based on what you've shared, here are some thoughts:

${intensity >= 7 ? "It sounds like you're feeling quite overwhelmed right now. When emotions get this intense, it's worth paying extra attention. Have you been feeling like this for a while, or is this more recent?" :
  intensity >= 5 ? "I can see you're experiencing some strong emotions. That's completely normal and human - we all go through times when feelings run high." :
  "It seems like you're in a pretty balanced emotional space, which is wonderful. This is actually a great time to build some emotional awareness skills."}

Looking at the specific emotions you mentioned:

${emotions.includes('depressed') || emotions.includes('hopeless') || emotions.includes('worthless') ?
  "Depression can feel so isolating and heavy. If these feelings have been hanging around for more than a couple weeks, it might be worth talking to someone professionally. Depression is incredibly treatable - you don't have to carry this weight alone." :
  
emotions.includes('anxious') || emotions.includes('worried') || emotions.includes('overwhelmed') ?
  "Anxiety can be exhausting, can't it? Your mind is probably trying to solve everything at once. Sometimes it helps to get specific about what exactly you're worried about - naming our fears can take away some of their power." :
  
emotions.includes('angry') || emotions.includes('frustrated') ?
  "Anger usually shows up when something important to us has been hurt or threatened. Have you been able to figure out what's underneath the anger? Sometimes it's hurt, sometimes fear, sometimes just exhaustion." :
  
emotions.includes('sad') || emotions.includes('lonely') ?
  "Sadness and loneliness can feel so heavy. There's something deeply human about these feelings though - they often show up when we care about connection and meaning in our lives." :
  
emotions.includes('happy') || emotions.includes('grateful') || emotions.includes('content') ?
  "I love that you're experiencing some positive emotions! It's so important to really notice and savor these moments when they come. We often rush past the good feelings." :
  
"The emotions you're experiencing make sense given what you're going through. Our feelings are usually trying to tell us something important."}

Some things that might be helpful to think about:

- How are you doing with the basics lately? Sleep, food, movement, connection with others?
- Is there anyone in your life you feel safe talking to about what's going on?
- What usually helps you feel more grounded when things get challenging?
- Have you noticed any patterns in your emotional life? Like certain triggers or times when things feel harder?

If you ever feel like you want more support, there are so many good options now - therapy, support groups, even apps that can help with specific things like anxiety or depression.

For now though, I just want to acknowledge that taking time to reflect like this is really valuable. You're showing up for yourself, and that matters.

What feels most important to focus on from all of this? 💙`
    },

    supportive_friend: {
      incident: `${randomOpening} Let me offer some thoughtful suggestions from someone who cares about your wellbeing. 🌟

What you experienced: "${entry.substring(0, 200)}..."
What you're processing: ${emotions.join(', ')}
How much it's affecting you: ${intensity}/10

Supportive suggestions coming up. Things like "I wonder if it might help to...", "Have you considered...", "What about trying...", "You might find comfort in...". Be caring but balanced, genuine and encouraging. 🌟💙`,
      
      daily: `${randomOpening} Let me offer some gentle suggestions from a caring friend perspective. 🌱

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
      console.log(`🎯 Generating suggestions for role: ${responseRole}, incident: ${isIncident}`);
      
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

DO NOT use any markdown formatting like **bold** or *italic* or any asterisks. Just write plain text suggestions that sound natural and conversational.

Return exactly 4-6 practical suggestions, each on a new line starting with a dash (-).`;

      console.log(`📝 Suggestion prompt preview: ${suggestionPrompt.substring(0, 200)}...`);
      
      const rawSuggestions = await callGemini(suggestionPrompt);
      console.log(`📥 Raw suggestions received: ${rawSuggestions.substring(0, 150)}...`);
      
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
        
      console.log(`✅ Processed ${suggestions.length} suggestions:`, suggestions.map(s => s.substring(0, 50) + '...'));
        
      if (suggestions.length < 3) {
        console.log(`⚠️ Not enough suggestions (${suggestions.length}), using defaults for ${responseRole}`);
        suggestions = getDefaultSuggestions(emotionAnalysis.dominantEmotion, sentiment, isIncident);
      }
    } catch (error: any) {
      console.error('❌ Suggestion generation failed for role:', responseRole, error.message);
      console.error('🔄 Falling back to default suggestions');
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