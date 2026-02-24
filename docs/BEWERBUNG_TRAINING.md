# Pathly — Interview Coaching: AI-Bewerbungstraining

> **Status:** Phase 1 · Coming Soon · Stand: Feb 2026
> **Scope:** Coaching Nav-Item (Phase 1: Stub) · AI-Avatar-Interview (Phase 2: Vollspezifikation) · Realtime Pipeline · Feedback-Engine · Supabase Session-Tracking
> **Einordnung:** Premium-Feature. ~3,00–5,50€ API-Kosten pro 20-Min.-Session. Wird separat freischaltbar sein.
> **Template:** Orientiert sich am `Master_Prompt_Template.md` aus [`dev-playbook/directives/`](https://github.com/yannikgaletto-art/dev-playbook/tree/main/directives)

---

## Goal

Ein AI-gesteuertes Interview-Coaching in Pathly integrieren, das den User mit einem fotorealistischen Avatar-Recruiter in einer echten Zoom-ähnlichen Umgebung konfrontiert — gespeißt aus dem eigenen CV und der Jobbeschreibung in der Queue. Der User soll nicht nur üben, sondern nach jeder Session ein strukturiertes Feedback erhalten: Stärken, Schwächen, die 3 kritischsten Momente und konkrete Verbesserungsvorschläge.

---

## Philosophie

Das erste Vorstellungsgespräch bei einem Traumjob ist der falsche Ort zum Üben. Klassische Bewerbungsratgeber sind statisch. Mock-Interviews mit echten Menschen sind teuer und schwer zu organisieren. Pathly löst das durch KI-Orchestrierung: Der Avatar kennt die Stellenanzeige, das CV, das Unternehmen — und stellt genau die Fragen, die ein echter Recruiter bei dieser Firma stellen würde.

**Silicon Valley-Prinzip:** Jede Session erzeugt auswertbare Daten. Nicht nur „war gut" oder „war schlecht", sondern Sentiment-Analyse pro Antwort, Sprech-Pace-Messung, Pausenlängen, Füllwort-Frequenz. Das gibt dem User einen Spiegel, den kein menschlicher Interviewer liefern kann.

**Lee Harris-Prinzip:** Interviews sind emotionale Ereignisse. Das System anerkennt das. Kein gamifizierter Score-Druck nach jeder Antwort während der Session. Das Feedback kommt erst danach — vollständig und kontextuell, nicht als Echtzeit-Urteil.

---

## Phase 1: Navigation Stub (Sofort umsetzbar)

### Ziel von Phase 1

Der Reiter „Coaching“ erscheint in der Sidebar. Ein Klick darauf zeigt eine elegante „Coming Soon“-Seite. Kein Backend, keine APIs, keine Kosten. Reine UI-Vorbereitung.

### 1.1 Sidebar-Änderung

In [`app/dashboard/components/sidebar.tsx`](https://github.com/yannikgaletto-art/job-automation-saas/blob/main/app/dashboard/components/sidebar.tsx) den Import und die `navItems` erweitern:

```typescript
// Änderung in app/dashboard/components/sidebar.tsx
import { Home, Inbox, BarChart3, Shield, Settings, GraduationCap } from 'lucide-react'

const navItems = [
  {
    title: 'Main',
    items: [
      { icon: Home,           label: 'Dashboard', href: '/dashboard',           badge: null },
      { icon: Inbox,          label: 'Job Queue',  href: '/dashboard/job-queue', badge: null },
      { icon: BarChart3,      label: 'Analytics',  href: '/dashboard/analytics', badge: null },
      { icon: GraduationCap,  label: 'Coaching',   href: '/dashboard/coaching',  badge: 'Soon' }, // NEU
    ],
  },
  {
    title: 'Tools',
    items: [
      { icon: Shield,   label: 'Data Security', href: '/dashboard/security', badge: null },
      { icon: Settings, label: 'Settings',       href: '/dashboard/settings', badge: null },
    ],
  },
]
```

Das `badge: 'Soon'` rendert automatisch über die bestehende Badge-Logik im Sidebar-Component.

### 1.2 Coming Soon Page

```
app/dashboard/coaching/
  page.tsx    ← Phase 1: Coming Soon
```

```tsx
// app/dashboard/coaching/page.tsx
import { GraduationCap, Sparkles } from 'lucide-react';

export default function CoachingPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      {/* Icon */}
      <div className="w-20 h-20 rounded-2xl bg-[#d4e3fe] flex items-center justify-center">
        <GraduationCap className="w-10 h-10 text-[#002e7a]" />
      </div>

      {/* Headline */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-[#37352F]">Interview Coaching</h1>
        <p className="text-[#73726E] max-w-md">
          Übe dein nächstes Vorstellungsgespräch mit einem KI-Recruiter,
          der deinen CV und die Stellenanzeige kennt.
        </p>
      </div>

      {/* Coming Soon Badge */}
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full
                      bg-[#002e7a]/5 border border-[#002e7a]/10">
        <Sparkles className="w-4 h-4 text-[#002e7a]" />
        <span className="text-sm font-medium text-[#002e7a]">Coming Soon</span>
      </div>

      {/* Feature Preview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mt-4">
        {[
          { emoji: '🧑‍💼', title: 'Realistischer Avatar', desc: 'Fotorealistischer KI-Recruiter, der nickt, blinzelt und spricht' },
          { emoji: '🧠', title: 'Job-spezifisch', desc: 'Trainiert auf deinem CV und der echten Jobbeschreibung' },
          { emoji: '📊', title: 'Tiefes Feedback', desc: 'Analyse nach der Session: Stärken, Schwächen, konkrete Tipps' },
        ].map(f => (
          <div key={f.title} className="bg-white rounded-xl border border-[#d6d6d6] p-4 text-left shadow-sm">
            <div className="text-2xl mb-2">{f.emoji}</div>
            <p className="text-sm font-semibold text-[#37352F]">{f.title}</p>
            <p className="text-xs text-[#73726E] mt-1">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Phase 2: Das vollständige Feature

### 2.1 Inputs

| Parameter | Pflichtfeld | Quelle | Beschreibung |
|---|---|---|---|
| `job_id` | ✅ Ja | URL-Param / Job Queue | Verknüpft Session mit Jobbeschreibung, Firma, Keywords |
| `user_id` | ✅ Ja | Supabase Auth | Welcher User trainiert |
| `cv_text` | ✅ Ja | User-Profil | Volltext des CVs für den System-Prompt |
| `interview_mode` | ❌ Optional | User-Wahl | `standard` (30min) / `focused` (15min) / `hard` (Stress-Test) |
| `focus_competencies` | ❌ Optional | User-Auswahl | Max. 3 Themen: z.B. `["Leadership", "Analytics", "Motivation"]` |
| `avatar_persona` | ❌ Optional | User-Wahl | `friendly` / `neutral` / `strict` — Schwärighkeitsgrad |

---

### 2.2 Tools / Services

| Baustein | Service (empfohlen) | Alternative | Rolle | Kosten / 20 Min |
|---|---|---|---|---|
| **Gehirn (LLM)** | OpenAI `gpt-4o-mini` | Claude 3.5 Haiku | Fragen generieren, Antworten verstehen | ~0,20–0,50€ |
| **Gehör (STT)** | Deepgram Nova-2 | OpenAI Whisper | User-Sprache → Text in <300ms | ~0,05–0,10€ |
| **Stimme (TTS)** | ElevenLabs Turbo v2 | OpenAI TTS-1-HD | LLM-Text → natürliche Stimme | ~0,15–0,40€ |
| **Gesicht (Avatar)** | **Simli.ai** | HeyGen Interactive | Echtzeit-Audio-Input → Video-Stream | ~2,00–4,00€ |
| **Signaling** | Next.js API Route | Supabase Edge Fn. | Session-Token-Austausch, WebSocket-Init | Bestehend |
| **Persistenz** | Supabase | — | Session-Daten, Feedback, Transkript | Bestehend |
| **Transkript-Analyse** | OpenAI `gpt-4o-mini` | Claude Haiku | Post-Session Feedback-Generierung | ~0,03–0,10€ |

**Gesamt-Kosten pro 20-Min.-Session: ca. 2,43–5,10€** (Bandbreite je nach Redeanteil)

**Warum Simli statt HeyGen als Empfehlung:**
- Simli unterstützt direktes Audio-Streaming als Input (kein extra TTS-Conversion-Layer nötig)
- Geringere Latenz (typisch 200–400ms vs. 600–900ms bei HeyGen Interactive)
- Developer-friendly API, besser dokumentiert für Next.js-Integration
- HeyGen als Fallback, falls Simli-Kapazitäten nicht ausreichen

**Warum NICHT die OpenAI Realtime API als All-in-One:**
Die Realtime API (gpt-4o-realtime-preview) klingt verführerisch, weil sie STT + LLM + TTS in einem WebSocket-Stream kombiniert. Jedoch:
- Kosten: $0.06/min Audio-Input + $0.24/min Audio-Output = ~$6,00/20min (zu teuer)
- Kein Avatar-Support nativ — Simli benötigt sowieso einen separaten Audio-Stream
- Weniger Kontrolle über Prompt-Steuerung und Unterbrechungslogik
Empfehlung: Separater Stack (Deepgram + GPT-4o-mini + ElevenLabs + Simli) gibt 60% Kostenersparnis bei ähnlicher Qualität.

---

## 3. Das Interface

### 3.1 Layout-Übersicht

```
┌────────────────────────────────────────────────────────────────────────┐
│  PATHLY — Interview Coaching                     [Abbrechen ✕]  │
├────────────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌───────────────────────────────────┐  ┌───────────────────┐  │
│  │                                   │  │                   │  │
│  │   [ AI AVATAR ]                   │  │  [ USER CAM ]     │  │
│  │   Fotorealistisch                 │  │  (eigene Kamera)  │  │
│  │   Nickt, blinzelt, spricht        │  │                   │  │
│  │   Lippen-synchron                 │  └───────────────────┘  │
│  │                                   │                        │
│  │   ● SPEAKING                       │  ┌───────────────────┐  │
│  └───────────────────────────────────┘  │  PATHLY CONTEXT    │  │
│                                          │  ───────────────── │  │
│                                          │  Job:             │  │
│                                          │  Patagonia GmbH   │  │
│                                          │  Sustainability   │  │
│                                          │  Manager          │  │
│                                          │  ───────────────── │  │
│                                          │  Aktuelle Tests:  │  │
│                                          │  ● Analytik       │  │
│                                          │  ○ Konfliktlös.   │  │
│                                          │  ○ Motivation     │  │
│                                          │  ───────────────── │  │
│                                          │  Dauer: 12:43     │  │
│                                          │  Fragen: 4 / 8    │  │
│                                          └───────────────────┘  │
│                                                                  │
├────────────────────────────────────────────────────────────────────────┤
│  LIVE TRANSKRIPTION                                               │
│  Avatar: „...und wie sind Sie in dem Projekt mit dem Stakeholder   │
│  umgegangen, der Ihre Idee zunächst abgelehnt hatte?“             │
│  User: „Ich habe zunächst versucht, die Perspektive...“ |         │
│                                                                  │
│  [  Mikro stumm  ]   [  Pause  ]   [  Interview beenden  ]       │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Pre-Session Setup Screen

Bevor das Interview beginnt: ein fokussierter Einrichtungsschirm.

```
┌──────────────────────────────────────────────────┐
│  Interview starten                               │
│  ────────────────────────────────────────────── │
│  Job:  🏢 Patagonia — Sustainability Manager     │
│                                                  │
│  Modus:  [ Standard 30min ] [ Fokus 15min ]      │
│          [ Stress-Test ⚡ ]                       │
│                                                  │
│  Interviewer: [ Freundlich ] [Neutral●] [Streng]  │
│                                                  │
│  Testthemen (max. 3):                            │
│  [✓] Analytisches Denken                        │
│  [✓] Stakeholder-Management                     │
│  [ ] Führung                                     │
│  [✓] Nachhaltigkeits-Expertise                  │
│                                                  │
│  Kamera: [Kamera-Vorschau  ✓ OK]                │
│  Mikro:  [Mic-Test ||||||||   ✓ OK]             │
│                                                  │
│  Geschätzte Kosten: ~3,80 € (Premium-Token)     │
│                                                  │
│  [  Interview starten  ]                         │
└──────────────────────────────────────────────────┘
```

### 3.3 Post-Session Feedback Screen

```
┌──────────────────────────────────────────────────┐
│  Session-Auswertung                              │
│  Patagonia — Sustainability Manager              │
│  ────────────────────────────────────────────── │
│  GESAMTEINDRUCK: 74 / 100                        │
│                                                  │
│  Analytik         ██████████  82%            │
│  Stakeholder-Mgmt ███████░░░  71%            │
│  Nachhaltigk.     ██████░░░░  63%            │
│                                                  │
│  BEST MOMENT 💡                                  │
│  Frage 3: „Deine STAR-Antwort zur Kundündigungs-  │
│  Situation war konkret und überzeugend."          │
│                                                  │
│  KRITISCHSTER MOMENT ⚠️                          │
│  Frage 6: „23 Füllwörter (ähm, also, halt) in   │
│  90 Sekunden. Verlangsame das Sprechtempo.“       │
│                                                  │
│  NEXT STEPS:                                     │
│  1. Bereite 2 weitere STAR-Beispiele für         │
│     Nachhaltigkeitsprojekte vor.                 │
│  2. Übe die 2-Minuten-Antwort auf Frage 6.       │
│                                                  │
│  [Transkript herunterladen] [Erneut üben]        │
└──────────────────────────────────────────────────┘
```

---

## 4. Architektur: Echtzeit-Pipeline

### 4.1 Datenfluss Übersicht

```
[USER BROWSER]
  Kamera/Mikro (WebRTC getUserMedia)
       │
       │ Audio-Chunks (PCM, 100ms)
       ▼
[PATHLY BACKEND — Session Handler]
  Next.js API Route / WebSocket Server
       │
       ├───► [BAUSTEIN 1: GEHEÖR]
       │          Deepgram Nova-2 WebSocket
       │          Input: Raw Audio-Chunks
       │          Output: Text-Transkript (Interim + Final)
       │          Latenz: < 200ms
       │
       ├───► [BAUSTEIN 2: GEHIRN]
       │          OpenAI GPT-4o-mini (Chat Completions)
       │          Input: Transkript + Session-History
       │          Output: Nächste Interviewer-Frage (Text)
       │          Latenz: 500–1.500ms
       │
       ├───► [BAUSTEIN 3: STIMME]
       │          ElevenLabs Turbo v2 TTS
       │          Input: LLM-Text
       │          Output: MP3/PCM Audio-Stream
       │          Latenz: 200–500ms
       │
       └───► [BAUSTEIN 4: GESICHT]
                  Simli.ai WebRTC
                  Input: Audio-Stream (von ElevenLabs)
                  Output: Video-Stream (Avatar spricht)
                  Latenz: 150–400ms
                       │
                       ▼
             [USER BROWSER]
             Avatar-Video + Transkript-Feed anzeigen

GESAMT-LATENZ (User antwortet → Avatar antwortet):
  STT: ~200ms + LLM: ~800ms + TTS: ~300ms + Avatar: ~300ms = ~1,6 Sekunden
  (Subjektiv: natürliche Reaktionszeit, keine unangenehme Pause)
```

### 4.2 Frontend-Workflow

#### Schritt 1: Session-Initialisierung

```typescript
// app/dashboard/coaching/[jobId]/session/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

export default function InterviewSession({ params }: { params: { jobId: string } }) {
  const localVideoRef  = useRef<HTMLVideoElement>(null);
  const avatarVideoRef = useRef<HTMLVideoElement>(null);
  const socketRef      = useRef<WebSocket | null>(null);
  const mediaRecorder  = useRef<MediaRecorder | null>(null);

  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [phase, setPhase]           = useState<'setup' | 'active' | 'paused' | 'done'>('setup');

  // Kamera + Mikro anfordern
  const initMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true }
    });
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  };

  // Session starten
  const startSession = async () => {
    const stream = await initMedia();

    // 1. Session-Token vom Backend holen
    const { sessionId, deepgramToken, simliConfig } = await fetch(
      '/api/coaching/session/start',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: params.jobId, mode: selectedMode, persona: selectedPersona })
      }
    ).then(r => r.json());

    // 2. WebSocket zum Session-Handler öffnen
    socketRef.current = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL}/coaching/${sessionId}`
    );

    // 3. Audio-Chunks via WebSocket an Backend streamen
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source       = audioContext.createMediaStreamSource(stream);
    const processor    = audioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      if (phase !== 'active') return;
      const pcmData = e.inputBuffer.getChannelData(0);
      const int16   = new Int16Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, pcmData[i] * 32767));
      }
      socketRef.current?.send(int16.buffer);
    };

    source.connect(processor);
    processor.connect(audioContext.destination);

    // 4. Incoming Messages verarbeiten
    socketRef.current.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case 'transcript_interim':
          updateTranscript('user', msg.text, true);
          break;
        case 'transcript_final':
          updateTranscript('user', msg.text, false);
          break;
        case 'avatar_speaking':
          updateTranscript('avatar', msg.text, false);
          break;
        case 'session_complete':
          setPhase('done');
          router.push(`/dashboard/coaching/${params.jobId}/feedback/${msg.feedbackId}`);
          break;
      }
    };

    setPhase('active');
  };
```

#### Schritt 2: Simli Avatar in iframe/WebRTC einbinden

```tsx
// Simli integriert per WebRTC PeerConnection
// Die Audio-Response von ElevenLabs wird im Backend direkt an Simli weitergeleitet.
// Das Video-Ergebnis kommt als WebRTC MediaStream zurück.

import { SimliClient } from 'simli-client'; // npm i simli-client

const simli = new SimliClient();

await simli.Initialize({
  apiKey:    process.env.NEXT_PUBLIC_SIMLI_API_KEY!,
  faceId:    simliConfig.faceId,         // Vom Backend mitgeliefert
  handleSilence: true,
  videoRef:  avatarVideoRef,             // <video> Ref im React-Component
  audioRef:  avatarAudioRef,             // <audio> Ref im React-Component
});

await simli.start();

// Simli empfängt Audio vom Backend über einen separaten WebSocket Channel
// Backend sendet: ElevenLabs Audio-Chunks → Simli → Render Video
```

### 4.3 Backend-Workflow

```typescript
// app/api/coaching/session/[sessionId]/ws/route.ts
// WebSocket Handler (Node.js WebSocket Server oder Vercel Edge Runtime)

import Deepgram from '@deepgram/sdk';
import OpenAI   from 'openai';
import ElevenLabs from 'elevenlabs';

const deepgram   = new Deepgram(process.env.DEEPGRAM_API_KEY!);
const openai     = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const elevenlabs = new ElevenLabs({ apiKey: process.env.ELEVENLABS_API_KEY! });

// Session State (in-memory pro Connection, persistent in Supabase)
interface SessionState {
  jobId:       string;
  userId:      string;
  history:     { role: 'user' | 'assistant'; content: string }[];
  transcript:  { speaker: string; text: string; timestamp: number }[];
  systemPrompt: string;
  questionCount: number;
  maxQuestions:  number;
}

async function handleWebSocket(ws: WebSocket, sessionState: SessionState) {

  // Deepgram Live Transcription starten
  const dgConnection = deepgram.transcription.live({
    model:       'nova-2',
    language:    'de',
    smart_format: true,
    interim_results: true,
    endpointing:  500,  // ms Stille bis "Fertig mit Sprechen"
  });

  // Deepgram Ergebnis → LLM → TTS → Avatar
  dgConnection.on('transcriptReceived', async (transcription) => {
    const { is_final, speech_final, channel } = transcription;
    const text = channel.alternatives[0].transcript;

    if (!text) return;

    // Interim: Nur ans Frontend schicken
    ws.send(JSON.stringify({ type: 'transcript_interim', text }));

    // Final: LLM aufrufen
    if (speech_final) {
      ws.send(JSON.stringify({ type: 'transcript_final', text }));
      sessionState.history.push({ role: 'user', content: text });
      sessionState.transcript.push({ speaker: 'user', text, timestamp: Date.now() });

      // Session beenden wenn max Fragen erreicht
      if (sessionState.questionCount >= sessionState.maxQuestions) {
        await finalizeSession(sessionState);
        ws.send(JSON.stringify({ type: 'session_complete', feedbackId: sessionState.feedbackId }));
        return;
      }

      // LLM: Nächste Frage generieren
      const response = await openai.chat.completions.create({
        model:       'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          { role: 'system', content: sessionState.systemPrompt },
          ...sessionState.history
        ]
      });

      const avatarText = response.choices[0].message.content ?? '';
      sessionState.history.push({ role: 'assistant', content: avatarText });
      sessionState.transcript.push({ speaker: 'avatar', text: avatarText, timestamp: Date.now() });
      sessionState.questionCount++;

      // Frontend informieren (für Transkript-Feed)
      ws.send(JSON.stringify({ type: 'avatar_speaking', text: avatarText }));

      // TTS: Text → Audio
      const audioStream = await elevenlabs.textToSpeech.convertAsStream(
        process.env.ELEVENLABS_VOICE_ID!,
        {
          text:        avatarText,
          model_id:    'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        }
      );

      // Audio → Simli (via separatem Simli-Backend-Channel)
      for await (const chunk of audioStream) {
        simliBackendChannel.send(chunk);
      }
    }
  });

  // Incoming Audio-Chunks von Browser → Deepgram weiterleiten
  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      dgConnection.send(event.data);
    }
  };

  ws.onclose = () => {
    dgConnection.finish();
  };
}
```

### 4.4 Session Start Route

```typescript
// app/api/coaching/session/start/route.ts
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { jobId, mode, persona } = await req.json();

  // Job-Daten aus Supabase laden
  const { data: job } = await supabase
    .from('jobs')
    .select('job_title, company_name, hard_requirements, tasks, ats_keywords, about_company_raw')
    .eq('id', jobId)
    .single();

  // CV des Users laden
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('cv_text')
    .eq('user_id', user.id)
    .single();

  // System Prompt generieren
  const systemPrompt = buildSystemPrompt({ job, cv: profile.cv_text, mode, persona });

  // Session in DB anlegen
  const { data: session } = await supabase.from('coaching_sessions').insert({
    user_id:       user.id,
    job_id:        jobId,
    mode,
    persona,
    status:        'active',
    system_prompt: systemPrompt,
    started_at:    new Date().toISOString()
  }).select().single();

  // Simli Face-ID aus Session-Config oder Default
  const simliConfig = {
    faceId: persona === 'strict' ? process.env.SIMLI_FACE_STRICT
                                 : process.env.SIMLI_FACE_NEUTRAL
  };

  return NextResponse.json({
    sessionId:    session.id,
    simliConfig,
    maxQuestions: mode === 'focused' ? 6 : mode === 'hard' ? 12 : 8
  });
}
```

---

## 5. System Prompt Design

### 5.1 Prompt-Aufbau

```typescript
// lib/coaching/prompt-builder.ts

const PERSONA_PRESETS = {
  friendly: "Du bist ein freundlicher, ermutigender Senior Recruiter.",
  neutral:  "Du bist ein professioneller, sachlicher Senior Recruiter.",
  strict:   "Du bist ein kritischer, präziser Senior Recruiter, der nichts durchgehen lässt."
};

export function buildSystemPrompt({
  job, cv, mode, persona, competencies
}: SessionConfig): string {
  return `
Du bist ein ${PERSONA_PRESETS[persona]} bei ${job.company_name}.
Du führst gerade ein Bewerbungsgespräch für die Stelle: ${job.job_title}.

DEIN VERHALTEN:
- Stelle immer NUR EINE Frage. Warte auf die Antwort, bevor du die nächste stellst.
- Beginne das Gespräch mit einer kurzen, menschlichen Vorstellung von dir.
- Nutze die STAR-Methode (Situation, Task, Action, Result) als Basis für Verhaltensfragen.
- Hake nach wenn eine Antwort zu vage ist (maximal einmal pro Antwort).
- Reagiere natürlich auf den Inhalt der Antworten — kein roboterhaftes Abarbeiten.
- Beende das Gespräch nach genau ${mode === 'focused' ? 6 : 8} Hauptfragen mit einem höflichen Abschluss.
- Sprich auf Deutsch. Natürlich, nicht steif.

AKTUELLE STELLE (${job.company_name}):
Aufgaben: ${(job.tasks ?? []).slice(0, 5).join(', ')}
Kernkompetenzen: ${(job.hard_requirements ?? []).slice(0, 5).join(', ')}
Über das Unternehmen: ${(job.about_company_raw ?? '').slice(0, 300)}

CV DES BEWERBERS:
${(cv ?? '').slice(0, 2000)}

FOKUS-THEMEN für dieses Interview:
${(competencies ?? []).map((c, i) => `${i + 1}. ${c}`).join('\n')}

WICHTIG:
- Halluziniere KEINE Unternehmensfakten.
- Werte Antworten NICHT öffentlich während des Gesprächs (Feedback kommt danach).
- Bleibe in der Rolle. Du bist ${job.company_name}-Recruiter, nicht eine KI.
`;
}
```

### 5.2 Post-Session Feedback Prompt

```typescript
export function buildFeedbackPrompt(transcript: TranscriptLine[]): string {
  const formatted = transcript
    .map(t => `${t.speaker === 'avatar' ? 'RECRUITER' : 'BEWERBER'}: ${t.text}`)
    .join('\n');

  return `
Analysiere das folgende Bewerbungsgespräch und erstelle ein strukturiertes Feedback.
Antworte AUSSCHLIEßLICH als JSON.

TRANSKRIPT:
${formatted}

JSON-SCHEMA:
{
  "overall_score": 0-100,
  "score_breakdown": {
    "clarity": 0-100,
    "structure": 0-100,
    "relevance": 0-100,
    "confidence_impression": 0-100
  },
  "best_moment": {
    "question_index": 1-8,
    "reason": "string"
  },
  "critical_moment": {
    "question_index": 1-8,
    "reason": "string",
    "suggestion": "string"
  },
  "filler_word_count": number,
  "avg_answer_length_words": number,
  "strengths": ["string", "string", "string"],
  "improvements": ["string", "string", "string"],
  "next_steps": ["string", "string"]
}
`;
}
```

---

## 6. Supabase Schema

```sql
-- supabase/migrations/20260224_coaching_sessions.sql

-- Haupt-Session-Tabelle
CREATE TABLE coaching_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  job_id         UUID REFERENCES jobs(id) ON DELETE SET NULL,

  -- Konfiguration
  mode           TEXT NOT NULL DEFAULT 'standard', -- 'standard' | 'focused' | 'hard'
  persona        TEXT NOT NULL DEFAULT 'neutral',  -- 'friendly' | 'neutral' | 'strict'
  competencies   TEXT[],                           -- Max. 3 Fokus-Themen
  system_prompt  TEXT,

  -- Verlauf
  status         TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'completed' | 'aborted'
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at       TIMESTAMPTZ,
  duration_sec   INTEGER,                          -- Berechnete Dauer
  question_count SMALLINT DEFAULT 0,

  -- Kosten-Tracking (für Billing)
  api_cost_eur   NUMERIC(6, 4),                    -- Tatsächliche API-Kosten in EUR

  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Transkript (eine Zeile pro Sprecher-Turn)
CREATE TABLE coaching_transcripts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID REFERENCES coaching_sessions(id) ON DELETE CASCADE NOT NULL,
  speaker       TEXT NOT NULL,                     -- 'user' | 'avatar'
  text          TEXT NOT NULL,
  timestamp_ms  BIGINT NOT NULL,                   -- ms seit Session-Start
  question_idx  SMALLINT,                          -- Welche Frage (1-8)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Feedback (einmalig pro Session, generiert nach Session-Ende)
CREATE TABLE coaching_feedback (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID REFERENCES coaching_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Scores
  overall_score         SMALLINT,
  score_breakdown       JSONB,                     -- {clarity, structure, relevance, confidence}

  -- Highlights
  best_moment           JSONB,                     -- {question_index, reason}
  critical_moment       JSONB,                     -- {question_index, reason, suggestion}

  -- Metriken
  filler_word_count     SMALLINT,
  avg_answer_length     SMALLINT,

  -- Qualitative Felder
  strengths             TEXT[],
  improvements          TEXT[],
  next_steps            TEXT[],

  -- Rohdaten
  raw_llm_response      JSONB,

  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Index für User-History
CREATE INDEX idx_coaching_sessions_user ON coaching_sessions (user_id, started_at DESC);
CREATE INDEX idx_coaching_feedback_user ON coaching_feedback (user_id, created_at DESC);

-- RLS
ALTER TABLE coaching_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_feedback   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User owns coaching data" ON coaching_sessions
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "User owns transcripts" ON coaching_transcripts
  FOR ALL USING (
    session_id IN (SELECT id FROM coaching_sessions WHERE user_id = auth.uid())
  );
CREATE POLICY "User owns feedback" ON coaching_feedback
  FOR ALL USING (auth.uid() = user_id);
```

---

## 7. Komponenten-Struktur

```
app/dashboard/coaching/
  page.tsx                          ← Phase 1: Coming Soon
  [jobId]/
    page.tsx                        ← Phase 2: Pre-Session Setup
    session/
      page.tsx                      ← Phase 2: Live Interview UI
      components/
        avatar-view.tsx             ← Simli <video> + Speaking-Indicator
        user-cam.tsx                ← Eigene Kamera (WebRTC)
        context-panel.tsx           ← Rechte Sidebar: Job, Kompetenzen, Timer
        transcript-feed.tsx         ← Live-Transkription Bottom Bar
        session-controls.tsx        ← Mute, Pause, Abbrechen Buttons
    feedback/
      [feedbackId]/
        page.tsx                    ← Phase 2: Post-Session Auswertung
        components/
          score-breakdown.tsx       ← Score-Bars für 4 Dimensionen
          best-moment-card.tsx      ← Grüne Karte: Bester Moment
          critical-moment-card.tsx  ← Gelbe Karte: Kritischster Moment
          improvement-list.tsx      ← 3 konkrete Next Steps
          transcript-viewer.tsx     ← Vollständiges Gespräch (collapsible)

hooks/
  use-coaching-session.ts           ← WebSocket + MediaRecorder + Simli State
  use-webrtc-media.ts               ← getUserMedia, Kamera/Mikro-Management

lib/coaching/
  prompt-builder.ts                 ← buildSystemPrompt, buildFeedbackPrompt
  session-manager.ts                ← Session-State-Machine
  cost-estimator.ts                 ← Kosten-Vorschau vor Session-Start

app/api/coaching/
  session/start/route.ts            ← POST: Session initialisieren
  session/[sessionId]/
    end/route.ts                    ← POST: Session beenden, Feedback triggern
    ws/route.ts                     ← WebSocket: Audio-Stream Handler
  feedback/[sessionId]/route.ts     ← GET: Feedback abrufen
```

---

## 8. Kosten & Pricing-Strategie

### 8.1 Kosten pro Session

| Service | 20 Min. Session | Berechnung |
|---|---|---|
| Deepgram Nova-2 | ~0,09€ | $0.0043/min × 20min = $0.086 |
| GPT-4o-mini | ~0,15€ | ~8 Antworten à 500 Tokens = $0.15 |
| ElevenLabs Turbo v2 | ~0,27€ | ~3.000 Output-Tokens à $0.0009 = $0.27 |
| Simli Avatar Streaming | ~2,40€ | $0.12/min × 20min = $2.40 |
| Post-Session Feedback | ~0,04€ | ~4.000 Tokens GPT-4o-mini = $0.04 |
| **Gesamt** | **~2,95€** | (Minimum) |
| Gesamt (Stress-Test, 30min) | ~5,10€ | 30min Simli + mehr LLM-Tokens |

**Pricing-Empfehlung für Pathly:**

| Modell | Preis | Inhalt |
|---|---|---|
| Free Tier | 0€/Monat | 0 Coaching Sessions |
| Pro | 19,90€/Monat | 5 Sessions/Monat inkl. |
| Pro+ | 39,90â‚¬/Monat | 15 Sessions/Monat inkl. |
| Pay-per-Use | 4,90€/Session | On-demand, ohne Abo |

Marge bei Pro: 5 Sessions × ~3€ Kosten = ~15€ Kosten, 19,90€ Preis → ~25% Bruttomarge (vor Infrastruktur). Pay-per-Use ist das kosteneffizienteste Modell für Pathly in der Frühphase.

---

## 9. Edge Cases

- **Kamera/Mikro-Zugriff verweigert:** Klare Fehlermeldung im Setup-Screen mit Anleitung zur Browser-Freigabe. Session kann nicht ohne Mikro gestartet werden. Kamera ist optional (nur Audio-Modus).
- **User hört auf zu sprechen (langes Schweigen):** Deepgram `endpointing: 500ms` registriert Stille. Nach 8 Sekunden Stille sendet der Avatar eine neutrale Weiterführung: *„Nehmen Sie sich ruhig Zeit — oder möchten Sie die Frage wiederholt hören?"*
- **Netzwerk-Unterbrechung (WebSocket):** Automatischer Reconnect-Versuch (3× mit 2s/4s/8s Backoff). Session-State ist in Supabase persistiert. Bei Reconnect wird History neu geladen. Nach 30 Sekunden ohne Reconnect: Session wird als `aborted` markiert, kein Billing.
- **Simli Avatar Latenz > 2 Sekunden:** Loading-Spinner mit Text *„Der Interviewer überlegt...“* — verhindert Verwirrung beim User.
- **LLM gibt keine Frage zurück (leere Antwort):** Fallback-Fragen-Array in Session-Config. Zieht nächste vorbereitete Frage.
- **Transkript-Qualität schlecht (Hintergrundgeräusch):** Deepgram `smart_format: true` + `noise_reduction: true`. Bei Konfidenz < 0.7 wird der Chunk ignoriert und nicht ans LLM weitergegeben.
- **Session länger als 45 Minuten:** Hard Limit. Avatar bringt Interview höflich zum Abschluss. Schützt vor uferlos hohen API-Kosten.
- **Feedback-LLM gibt kein valides JSON zurück:** Zod-Validierung. Bei Fehler: 1 Retry mit expliziterem Prompt. Bei erneutem Fehler: Feedback mit Partial-Data anzeigen und User informieren.
- **User bricht Session manuell ab:** Sofortiger Session-Abbruch, `status: 'aborted'`. Billing nur für tatsächlich verbrauchte Minuten. Kein Feedback generiert bei < 3 Fragen.
- **Job-Daten nicht vorhanden (`job_id` invalid):** Setup-Screen zeigt Warnung. Session startet mit generischem Prompt ohne spezifische Firmen-/Job-Daten. User wird darauf hingewiesen.

---

## 10. Error Handling

### 10.1 Frontend (WebSocket)

```typescript
// hooks/use-coaching-session.ts

const MAX_RETRIES    = 3;
const RETRY_DELAYS   = [2000, 4000, 8000]; // ms

let retryCount = 0;

function connectWebSocket(sessionId: string) {
  const ws = new WebSocket(`${WS_URL}/coaching/${sessionId}`);

  ws.onclose = (event) => {
    if (event.wasClean || retryCount >= MAX_RETRIES) {
      if (retryCount >= MAX_RETRIES) {
        setError('Verbindung verloren. Bitte überprüfe deine Internetverbindung.');
        markSessionAborted(sessionId);
      }
      return;
    }
    const delay = RETRY_DELAYS[retryCount++];
    setTimeout(() => connectWebSocket(sessionId), delay);
  };

  ws.onerror = (err) => {
    console.error('[WebSocket] Error:', err);
    // Kein User-Toast — onclose handelt Reconnect
  };
}
```

### 10.2 Backend (Partial Failure)

```typescript
// Wenn ElevenLabs TTS fehlschlägt:
// → LLM-Text trotzdem ans Frontend senden (Transkript sichtbar)
// → Avatar zeigt Idle-Loop statt zu sprechen
// → User sieht Text, kann antworten

try {
  const audioStream = await elevenlabs.tts(text);
  for await (const chunk of audioStream) {
    simliChannel.send(chunk);
  }
} catch (ttsError) {
  console.error('[TTS] Failed, falling back to text-only:', ttsError);
  ws.send(JSON.stringify({ type: 'avatar_text_only', text }));
  // Session läuft weiter — nur kein Avatar-Sound
}
```

### 10.3 Billing-Schutz

```typescript
// Vor Session-Start: Token-Balance prüfen
const { data: userBalance } = await supabase
  .from('user_billing')
  .select('coaching_tokens_remaining')
  .eq('user_id', user.id)
  .single();

if ((userBalance?.coaching_tokens_remaining ?? 0) <= 0) {
  return NextResponse.json(
    { error: 'Insufficient tokens', redirect: '/dashboard/settings/billing' },
    { status: 402 }
  );
}

// Nach Session-Ende: Tatsächliche Kosten abziehen
await supabase.from('user_billing').update({
  coaching_tokens_remaining: userBalance.coaching_tokens_remaining - actualCostEur
}).eq('user_id', user.id);
```

---

## 11. Testing Protocol

### 11.1 Unit Tests

```bash
jest tests/unit/coaching/prompt-builder.test.ts

# Erwartetes Ergebnis:
# ✅ buildSystemPrompt: enthält company_name, job_title, competencies
# ✅ buildSystemPrompt: persona 'strict' → enthält 'kritischer'
# ✅ buildSystemPrompt: CV wird auf 2000 Zeichen gekürzt
# ✅ buildFeedbackPrompt: Transkript korrekt formatiert (RECRUITER / BEWERBER)
# ✅ cost-estimator: 20min, standard → Kosten zwischen 2.50 und 5.50
```

### 11.2 Integrations-Tests

```bash
jest tests/integration/coaching.test.ts

# Erwartetes Ergebnis:
# ✅ POST /api/coaching/session/start: 200, sessionId + simliConfig vorhanden
# ✅ POST /api/coaching/session/start ohne Job-Daten: 200, generischer Prompt
# ✅ POST /api/coaching/session/[id]/end: Feedback generiert, in DB gespeichert
# ✅ GET /api/coaching/feedback/[id]: Vollständiges Feedback-JSON
# ✅ Unauthenticated: 401 auf allen Routes
# ✅ Insufficient Tokens: 402 mit redirect-URL
```

### 11.3 Feedback-Qualitäts-Tests

```typescript
// tests/unit/coaching/feedback.test.ts

// Test: LLM erkennt Füllwörter
const transcript = [
  { speaker: 'avatar', text: 'Erzählen Sie von einem Konflikt.' },
  { speaker: 'user',   text: 'Ähm, also, ich hatte ähm mal einen Kollegen, also...' }
];
const feedback = await generateFeedback(transcript);
expect(feedback.filler_word_count).toBeGreaterThan(3);

// Test: Gute STAR-Antwort wird positiv bewertet
const goodTranscript = [
  { speaker: 'avatar', text: 'Erzählen Sie von einem Projekterfolg.' },
  { speaker: 'user',   text: 'In meinem letzten Projekt hatte ich die Aufgabe, ... Das Ergebnis war eine 30%-ige Kostensenkung.' }
];
const goodFeedback = await generateFeedback(goodTranscript);
expect(goodFeedback.score_breakdown.structure).toBeGreaterThan(75);
```

### 11.4 End-to-End Test (manuell)

```
1. /dashboard/coaching öffnen → "Coming Soon" Screen (Phase 1)

-- Phase 2 (nach Implementierung):
2. Job aus Queue wählen → Coaching-Button klicken
3. Setup-Screen: Modus "Fokus", Persona "Neutral", 2 Kompetenzen auswählen
4. Kamera + Mikro freigeben → Vorschau prüfen
5. "Interview starten" klicken
6. Avatar-Video erscheint, Begrüßung ertönt (< 5 Sekunden)
7. Auf Frage antworten → Transkript aktualisiert sich in Echtzeit
8. Avatar stellt Nächste Frage (< 3 Sekunden nach Antwort-Ende)
9. Nach 6 Fragen: Avatar beendet höflich, Weiterleitung zu Feedback
10. Feedback-Screen: Scores, Best Moment, Critical Moment, Next Steps prüfen
11. Supabase prüfen: coaching_sessions, coaching_transcripts, coaching_feedback befüllt
12. API-Kosten in coaching_sessions.api_cost_eur ≤ 5.50€
```

---

## Outputs (Deliverables)

**Phase 1 (Sofort):**
- `Änderung sidebar.tsx` — Coaching-Link mit `GraduationCap`-Icon + `badge: 'Soon'`
- `app/dashboard/coaching/page.tsx` — Coming Soon Screen mit Feature-Preview

**Phase 2 (Vollständige Umsetzung):**
- Pre-Session Setup Screen mit Modus, Persona, Kompetenz-Auswahl, Kamera-Test
- Live Interview UI: Avatar (Simli) + User-Cam + Context Panel + Transkript-Feed
- Post-Session Feedback Screen: Scores, Highlights, Next Steps, Transkript-Viewer
- `POST /api/coaching/session/start` Route
- `WebSocket /api/coaching/session/[id]/ws` Handler
- `POST /api/coaching/session/[id]/end` Route + Feedback-Generierung
- `supabase: coaching_sessions`, `coaching_transcripts`, `coaching_feedback` Tabellen
- `lib/coaching/prompt-builder.ts` — System Prompt + Feedback Prompt
- Billing-Guard: Token-Balance-Prüfung vor Session-Start

---

## Master Prompt Template Compliance

Dieses Dokument orientiert sich am `Master_Prompt_Template.md` aus [`dev-playbook/directives/`](https://github.com/yannikgaletto-art/dev-playbook/tree/main/directives).

### ✅ Sections Included:

1. **Goal** — Klares, einzeiliges Ziel ✅
2. **Inputs** — Alle Parameter mit Typ, Pflichtfeld, Quelle ✅
3. **Tools/Services** — Vollständige Dependency-Liste mit Kosten-Vergleich ✅
4. **Process** — Phase 1 (Stub) + Phase 2 (Vollarchitektur) mit Code ✅
5. **Outputs (Deliverables)** — Getrennt nach Phase 1 / Phase 2 ✅
6. **Edge Cases** — Netzwerk, Stille, Qualität, Billing, Abbruch ✅
7. **Error Handling** — WebSocket Reconnect, TTS-Fallback, Billing-Schutz ✅
8. **Testing Protocol** — Unit, Integration, Qualität, E2E ✅

### ✅ Design-Prinzipien:

- **Phase-Trennung:** Phase 1 (Stub) ist in 30 Minuten umsetzbar — unabhängig von Phase 2 ✅
- **Kein Echtzeit-Feedback während Session:** Nur Post-Session — psychologisch korrekt ✅
- **Billing-Transparenz:** Geschätzte Kosten sichtbar vor Session-Start ✅
- **Kostensparend:** Separater Stack 60% günstiger als OpenAI Realtime API ✅
- **Graceful Degradation:** TTS-Fehler → Text-only-Modus, kein Session-Abbruch ✅
- **Data Ownership:** Alle Transkripte in Supabase — DSGVO-konform ✅

---

*Letzte Aktualisierung: Feb 2026 · Yannik Galetto*
