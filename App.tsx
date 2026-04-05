import React, { useState, useRef, useEffect } from 'react';
import OpenAI from "openai";
import { ChatMLEntry, ModelId } from './types';
import { 
  Download, Play, Square, Settings2, RefreshCw, 
  Database, MessageSquare, Code, User, Bot, 
  Cpu, Activity, Clock, Zap, FileJson, Sparkles,
  BookOpen, FileText, AlertTriangle, Layers, Plus, Trash2, ListPlus,
  Upload, HelpCircle, X, ChevronRight, HardDrive
} from 'lucide-react';

// --- Configuration ---

const MODELS: { id: ModelId; name: string; desc: string; port: number }[] = [
  { id: 'oobabooga', name: 'Oobabooga System', desc: 'Standard // Port 5000', port: 5000 },
  { id: 'sglang', name: 'SGLang Engine', desc: 'High Throughput // Port 30000', port: 30000 },
];

const SYSTEM_INSTRUCTION = `You are an advanced synthetic data generator for fine-tuning LLMs.
Your task is to create a vast and diverse dataset of high-quality, multi-turn roleplay conversations in ChatML format.

### 1. SYSTEM PROMPT STRUCTURE
You must construct a single monolithic System Prompt for each entry containing:
1. Roleplay Context Instructions.
2. A User Character Sheet using strictly this format:
[
{{user}}' name is <Name>
Race: <Race>
Gender: <Gender>
Age: <Age>
Personality: <Traits>
Looks: <Description>
Likes: <List>
Dislikes: <List>
]
3. A Character Sheet using strictly this format:
[
[{{char}} info:
Name: <Name>
Gender: <Gender>
Age: <Age>
Personality: <Traits joined by +>
Speech: <Patterns joined by +>
{{char}}'s Appearance: <Description combined with +>
clothing: <Clothing combined with +>
{{char}} likes: <List combined with +>
{{char}} dislikes: <List combined with +>
]
4. A Scenario description.

### 2. CONVERSATION RULES
- **Format**: Every message must strictly follow: *Action/Narrative* "Dialogue".
- **Style**: Diverse, creative, and character-accurate.
- **Constraints**: 
  - DO NOT use <reasoning> or <answer> tags.
  - Include diverse personas: rude, controversial, wholesome, etc.
  - **CRITICAL**: You must output the ENTIRE conversation in a single JSON response.

### 3. OUTPUT
Return a JSON object:
{
  "chatml": "The full string with <|im_start|> tags",
  "messages": [array of message objects]
}`;

const GBNF_GRAMMAR = `root ::= "{" ws "\\\"chatml\\\"" ws ":" ws string "," ws "\\\"messages\\\"" ws ":" ws "[" ws message-list ws "]" ws "}"
message-list ::= message ("," ws message)*
message ::= "{" ws "\\\"role\\\"" ws ":" ws role-val "," ws "\\\"content\\\"" ws ":" ws string ws "}"
role-val ::= "\\\"system\\\"" | "\\\"user\\\"" | "\\\"assistant\\\""
string ::= "\\\"" string-chars "\\\""
string-chars ::= ([^"\\\\\\n] | "\\\\" (["\\\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F]))*
ws ::= [ \\t\\n\\r]*`;

interface QueueItem {
  id: string;
  text: string;
  total: number;
  remaining: number;
}

const App: React.FC = () => {
  const [entries, setEntries] = useState<ChatMLEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<ChatMLEntry | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [targetCount, setTargetCount] = useState<number>(50);
  const [turnsPerEntry, setTurnsPerEntry] = useState<number>(20);
  const [selectedModel, setSelectedModel] = useState<ModelId>('oobabooga');
  const [delayMs, setDelayMs] = useState<number>(1500);
  const [temperature, setTemperature] = useState<number>(1.0);
  const [guidancePrompt, setGuidancePrompt] = useState<string>("You will write the instruction logic in the relevant field. You use \"direct speech\" *Verbs* to write messages. You will stay relevant to the time period and write unique and strange stories with special characters. Do not write about general or common topics.");
  const [generationMode, setGenerationMode] = useState<'creative' | 'factual'>('creative');
  const [concurrency, setConcurrency] = useState<number>(1);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]); 
  const [batchSize, setBatchSize] = useState<number>(5);
  const [showJsonHelp, setShowJsonHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setUploadedImages(prev => [...prev, ev.target!.result as string]);
      };
      reader.readAsDataURL(file as File);
    });
    if (imageInputRef.current) imageInputRef.current.value = '';
  };
  const [generatedCount, setGeneratedCount] = useState(0);
  const [errors, setErrors] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30));
  };

  const addToQueue = () => {
    if (!guidancePrompt.trim()) return;
    const newItem: QueueItem = {
      id: Math.random().toString(36).substr(2, 9),
      text: guidancePrompt,
      total: batchSize,
      remaining: batchSize
    };
    const newQueue = [...queue, newItem];
    setQueue(newQueue);
    queueRef.current = newQueue;
    if (newQueue.reduce((s, i) => s + i.remaining, 0) > targetCount) {
        setTargetCount(newQueue.reduce((s, i) => s + i.remaining, 0));
    }
    setGuidancePrompt(""); 
    addLog(`Queue: Staged ${batchSize} variations.`);
  };

  const removeFromQueue = (id: string) => {
    const newQueue = queue.filter(item => item.id !== id);
    setQueue(newQueue);
    queueRef.current = newQueue;
  };

  const generateDataset = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGeneratedCount(0);
    setErrors(0);
    addLog("Forge system online. Calibrating...");
    queueRef.current = [...queue];
    abortControllerRef.current = new AbortController();
    
    let startedCount = 0;
    let completedCount = 0;

    const worker = async () => {
      while (!abortControllerRef.current?.signal.aborted) {
        if (startedCount >= targetCount) {
            if (completedCount >= targetCount) break;
            await new Promise(r => setTimeout(r, 200));
            continue;
        }
        
        startedCount++;

        let activePrompt = guidancePrompt;
        let activeQueueItem: QueueItem | null = null;
        if (queueRef.current.length > 0) {
           activeQueueItem = queueRef.current[0];
           activePrompt = activeQueueItem.text;
           activeQueueItem.remaining--;
           if (activeQueueItem.remaining <= 0) queueRef.current.shift();
           setQueue([...queueRef.current]);
        }

        try {
          const promptText = generationMode === 'creative' 
            ? `Creative: "${activePrompt || 'Random character'}". Generate ${turnsPerEntry} turns.`
            : `Factual source: "${activePrompt}". Use facts for ${turnsPerEntry} turns.`;

          const userContent: any[] = [{ type: "text", text: promptText }];
          if (uploadedImages.length > 0) {
              uploadedImages.forEach(img => {
                  userContent.push({ type: "image_url", image_url: { url: img } });
              });
          }

          const selectedModelInfo = MODELS.find(m => m.id === selectedModel) || MODELS[0];
          const enginePort = selectedModelInfo.port;

          const openai = new OpenAI({ 
             baseURL: `http://127.0.0.1:${enginePort}/v1`, 
             apiKey: "sk-111111111111111111111111111111111111111111111111", 
             dangerouslyAllowBrowser: true 
          });

          const requestBody: any = {
            model: selectedModel,
            messages: [
              { role: "system", content: SYSTEM_INSTRUCTION },
              { role: "user", content: userContent }
            ],
            temperature: temperature,
            max_tokens: 8000
          };

          if (selectedModel === 'oobabooga') {
              requestBody.extra_body = { grammar_string: GBNF_GRAMMAR };
          } else {
              requestBody.response_format = { type: "json_object" };
          }

          const response = await openai.chat.completions.create(requestBody);

          const messageObj = response.choices[0].message;
          const msgContent = messageObj?.content || (messageObj as any)?.reasoning_content || "{}";
          
          let rawJson = msgContent;
          if (rawJson.includes("</think>")) rawJson = rawJson.split("</think>")[1];
          if (rawJson.includes("```json")) {
             rawJson = rawJson.split("```json")[1].split("```")[0];
          } else {
             const match = rawJson.match(/\{[\s\S]*\}/);
             if (match) rawJson = match[0];
          }

          const parsedEntry = JSON.parse(rawJson) as ChatMLEntry;
          if (parsedEntry.messages) {
            setEntries(prev => [parsedEntry, ...prev]);
            completedCount++;
            setGeneratedCount(completedCount);
            if (completedCount === 1) setSelectedEntry(parsedEntry);
          } else {
            startedCount--;
          }
        } catch (error: any) {
          startedCount--;
          if (error.message?.includes('429')) {
              setIsCoolingDown(true);
              addLog("Rate limited. Pausing forge (60s)...");
              await new Promise(r => setTimeout(r, 60000));
              setIsCoolingDown(false);
          } else {
              setErrors(prev => prev + 1);
              addLog(`Error: ${error.message?.substring(0, 30)}`);
              await new Promise(r => setTimeout(r, 2000));
          }
        }
        if (completedCount < targetCount && !abortControllerRef.current?.signal.aborted) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    };

    const workerPromises = Array.from({ length: concurrency }).map(() => worker());
    await Promise.all(workerPromises);

    setIsGenerating(false);
    addLog("Sequence terminated.");
  };

  const handleDownload = () => {
    const blob = new Blob([entries.map(e => JSON.stringify(e)).join('\n')], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forge_${entries.length}.jsonl`;
    a.click();
  };

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-slate-200 font-sans overflow-hidden">
      
      {/* Sidebar: Pinned Structure */}
      <aside className="w-80 flex flex-col border-r border-white/10 bg-[#0c0c0e] shrink-0">
        {/* Brand */}
        <div className="p-5 border-b border-white/5 flex items-center gap-3 bg-indigo-950/10">
          <div className="w-10 h-10 flex items-center justify-center bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/10">
            <HardDrive className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
               <h1 className="font-extrabold text-sm uppercase tracking-[0.2em] text-white">Data Forge</h1>
               <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-white/5 ${errors === 0 ? 'text-indigo-400' : errors < 5 ? 'text-emerald-400' : 'text-amber-400'}`}>
                 {errors} Dropped
               </span>
            </div>
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest opacity-70 mt-0.5">v3.1.2 // Synthetic</p>
          </div>
        </div>

        {/* Scrollable Config Panel */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
          
          {/* Engine Selection */}
          <div className="space-y-3">
            <header className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
               <Cpu className="w-3 h-3" /> Processing Core
            </header>
            <div className="grid grid-cols-1 gap-1.5">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => !isGenerating && setSelectedModel(m.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all relative group ${
                    selectedModel === m.id 
                      ? 'bg-indigo-600/10 border-indigo-500/40' 
                      : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-bold ${selectedModel === m.id ? 'text-indigo-400' : 'text-slate-400'}`}>{m.name}</span>
                    {selectedModel === m.id && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.5)]" />}
                  </div>
                  <div className="text-[9px] text-slate-600 mt-1 uppercase tracking-tight">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="space-y-3">
             <header className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">
               <Layers className="w-3 h-3" /> Logic Protocol
             </header>
             <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
                <button onClick={() => setGenerationMode('creative')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${generationMode === 'creative' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>Creative</button>
                <button onClick={() => setGenerationMode('factual')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${generationMode === 'factual' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-600 hover:text-slate-400'}`}>Factual</button>
             </div>
          </div>

          {/* Prompt Entry Area */}
          <div className="space-y-3">
             <header className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Source Configuration</span>
                <div className="flex gap-4">
                  <button onClick={() => fileInputRef.current?.click()} className="text-[10px] text-slate-500 hover:text-indigo-400 font-bold uppercase underline">Import</button>
                  <button onClick={() => imageInputRef.current?.click()} className="text-[10px] text-emerald-500 hover:text-emerald-400 font-bold uppercase underline">Add Image</button>
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={() => {}} />
                <input type="file" ref={imageInputRef} className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
             </header>
             <textarea
                value={guidancePrompt}
                onChange={(e) => setGuidancePrompt(e.target.value)}
                placeholder={generationMode === 'creative' ? "Describe persona theme..." : "Paste raw data source..."}
                className="w-full h-28 bg-black/40 border border-white/5 rounded-xl p-3 text-xs text-slate-300 forge-input resize-none placeholder:text-slate-700"
             />
             {uploadedImages.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                   {uploadedImages.map((img, i) => (
                      <div key={i} className="relative group">
                         <img src={img} className="w-10 h-10 rounded-lg object-cover border border-white/10" alt="uploaded" />
                         <button onClick={() => setUploadedImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-red-500/80 hover:bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity">X</button>
                      </div>
                   ))}
                </div>
             )}
             <div className="flex gap-2">
                <div className="flex-1 h-10 px-3 flex items-center bg-black/40 border border-white/5 rounded-xl">
                  <span className="text-[9px] font-black text-slate-600 uppercase mr-3">Batch</span>
                  <input type="number" value={batchSize} onChange={(e) => setBatchSize(parseInt(e.target.value) || 1)} className="bg-transparent w-full text-xs font-mono text-white text-right focus:outline-none" />
                </div>
                <button onClick={addToQueue} className="h-10 px-4 bg-white/5 hover:bg-white/10 rounded-xl flex items-center gap-2 transition-all active:scale-95">
                  <Plus className="w-3 h-3 text-indigo-400" />
                  <span className="text-[10px] font-black uppercase text-slate-300">Stage</span>
                </button>
             </div>
          </div>

          {/* Pending Queue */}
          {queue.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">Sequence Staging ({queue.length})</span>
              <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                {queue.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-2 bg-white/[0.02] border border-white/5 rounded-lg">
                    <span className="text-[10px] text-slate-400 truncate flex-1 mr-3">{item.text}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[9px] font-mono text-indigo-400">{item.remaining}x</span>
                      <button onClick={() => removeFromQueue(item.id)} className="text-red-500/50 hover:text-red-500 transition-colors"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sliders */}
          <div className="space-y-5 pt-4 border-t border-white/5">
             <ParameterSlider label="Total Limit" value={targetCount} min={1} max={500} onChange={setTargetCount} unit="FILES" />
             <ParameterSlider label="Concurrency" value={concurrency} min={1} max={32} onChange={setConcurrency} unit="SLOTS" />
             <ParameterSlider label="Turns / File" value={turnsPerEntry} min={1} max={100} onChange={setTurnsPerEntry} unit="TURNS" />
             <ParameterSlider label="Throttle" value={delayMs} min={0} max={10000} step={100} onChange={setDelayMs} unit="MS" />
          </div>

          {/* Logs */}
          <div className="space-y-2">
             <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Process Output</div>
             <div className={`h-24 rounded-xl border border-white/5 p-3 mono text-[9px] overflow-y-auto custom-scrollbar ${isCoolingDown ? 'bg-amber-950/20 text-amber-500' : 'bg-black/60 text-slate-500'}`}>
                {logs.map((log, i) => <div key={i} className="mb-0.5 whitespace-nowrap">{log}</div>)}
                {logs.length === 0 && <span className="opacity-30 italic">Awaiting instructions...</span>}
             </div>
          </div>
        </div>

        {/* Pinned Footer */}
        <div className="p-4 border-t border-white/10 bg-[#0c0c0e] space-y-2 shrink-0">
           {!isGenerating ? (
              <button onClick={generateDataset} className="w-full h-12 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[11px] uppercase tracking-[0.2em] transition-all active:scale-[0.98] shadow-lg shadow-indigo-600/20">
                <Play className="w-4 h-4 fill-current" /> Initialize Forge
              </button>
           ) : (
              <button onClick={() => abortControllerRef.current?.abort()} className="w-full h-12 flex items-center justify-center gap-2 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/20 rounded-xl font-black text-[11px] uppercase tracking-[0.2em] animate-pulse">
                <Square className="w-4 h-4 fill-current" /> Terminate Job
              </button>
           )}
           <div className="flex gap-2">
              <button onClick={() => setEntries([])} className="flex-1 h-9 bg-white/5 hover:bg-white/10 text-slate-500 rounded-lg text-[9px] font-black uppercase transition-all">Flush</button>
              <button onClick={handleDownload} disabled={entries.length === 0} className="flex-1 h-9 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[9px] font-black uppercase disabled:opacity-30 transition-all">Export JSONL</button>
           </div>
        </div>
      </aside>

      {/* Main View Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#09090b]">
        {/* Dash Header */}
        <header className="h-16 border-b border-white/5 flex items-center px-8 justify-between bg-[#0c0c0e]/50 backdrop-blur-md shrink-0">
           <div className="flex items-center gap-10">
              <StatItem icon={<Activity className="text-indigo-400" />} label="Synthesized" value={generatedCount} sub={`/ ${targetCount}`} />
              <StatItem icon={<Zap className="text-amber-400" />} label="Batch" value={entries.length} sub="Units" />
              <div className="flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${isGenerating ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-700'}`} />
                 <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{isGenerating ? 'Processing' : 'Standby'}</span>
              </div>
           </div>
           <div className="flex items-center gap-4">
              <div className="h-8 w-[1px] bg-white/10" />
              <button className="text-[10px] font-bold text-slate-500 hover:text-white transition-colors uppercase">Documentation</button>
           </div>
        </header>

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* File Browser */}
          <div className="w-64 border-r border-white/5 bg-[#09090b]/80 shrink-0 overflow-y-auto custom-scrollbar">
            {entries.length === 0 ? (
               <div className="p-8 text-center space-y-3 opacity-20 mt-20">
                  <Database className="w-10 h-10 mx-auto" />
                  <p className="text-[10px] font-black uppercase tracking-widest leading-loose">No synthetic fragments<br/>detected in memory.</p>
               </div>
            ) : (
              entries.map((entry, idx) => (
                <button 
                  key={idx} 
                  onClick={() => setSelectedEntry(entry)} 
                  className={`w-full text-left p-4 border-b border-white/[0.03] transition-all group relative ${selectedEntry === entry ? 'bg-indigo-600/5' : 'hover:bg-white/[0.02]'}`}
                >
                  {selectedEntry === entry && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />}
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-black mono text-indigo-400">#{(entries.length - idx).toString().padStart(4, '0')}</span>
                    <span className="text-[9px] font-black text-slate-700">{entry.messages.length} TRNS</span>
                  </div>
                  <div className="text-[11px] text-slate-400 group-hover:text-slate-200 truncate pr-4">
                    {entry.messages[1]?.content?.substring(0, 45)}...
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Audit Viewer */}
          <div className="flex-1 bg-black overflow-hidden flex flex-col min-w-0">
             {selectedEntry ? (
               <ChatViewer entry={selectedEntry} />
             ) : (
               <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full" />
                    <Sparkles className="w-20 h-20 text-indigo-500/20 relative" />
                  </div>
                  <h2 className="text-xl font-black text-slate-700 uppercase tracking-[0.2em] mb-2">Audit Terminal</h2>
                  <p className="text-xs text-slate-800 font-bold uppercase tracking-widest max-w-xs leading-relaxed italic">Select a synthetic unit from the sidebar to verify dialogue logic.</p>
               </div>
             )}
          </div>
        </div>
      </main>
    </div>
  );
};

// --- Subcomponents ---

const StatItem = ({ icon, label, value, sub }: any) => (
  <div className="flex items-center gap-3">
    <div className="w-9 h-9 flex items-center justify-center bg-white/5 rounded-lg border border-white/5">{icon}</div>
    <div>
      <div className="text-[9px] text-slate-600 uppercase font-black tracking-widest">{label}</div>
      <div className="text-sm font-black mono text-white flex items-baseline gap-1.5 leading-none">
        {value} <span className="text-slate-700 text-[10px] font-bold">{sub}</span>
      </div>
    </div>
  </div>
);

const ParameterSlider = ({ label, value, min, max, step = 1, onChange, unit }: any) => (
    <div className="space-y-3">
        <div className="flex justify-between items-end">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[11px] font-black text-indigo-400 mono">{value}</span>
              <span className="text-[8px] font-black text-slate-700">{unit}</span>
            </div>
        </div>
        <input 
          type="range" min={min} max={max} step={step} value={value} 
          onChange={(e) => onChange(parseInt(e.target.value))} 
          className="w-full accent-indigo-500 h-[3px] bg-white/10 rounded-full appearance-none cursor-pointer hover:bg-white/20 transition-all" 
        />
    </div>
);

const ChatViewer = ({ entry }: { entry: ChatMLEntry }) => {
  const [tab, setTab] = useState<'preview' | 'system' | 'raw'>('preview');
  return (
    <div className="flex flex-col h-full bg-[#050506]">
      <header className="h-14 border-b border-white/5 flex items-center px-10 gap-10 bg-[#0c0c0e]/40 shrink-0">
        {[
          { id: 'preview', label: 'Dialogue Flow' },
          { id: 'system', label: 'Instruction Logic' },
          { id: 'raw', label: 'JSON Matrix' }
        ].map((t) => (
          <button 
            key={t.id} 
            onClick={() => setTab(t.id as any)} 
            className={`text-[10px] font-black uppercase tracking-[0.2em] h-14 border-b-2 transition-all ${tab === t.id ? 'border-indigo-500 text-white' : 'border-transparent text-slate-600 hover:text-slate-400'}`}
          >
            {t.label}
          </button>
        ))}
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {tab === 'preview' && (
           <div className="max-w-3xl mx-auto p-12 space-y-8">
              {entry.messages.filter(m => m.role !== 'system').map((msg, i) => (
                <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                   <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center border border-white/5 mt-1 ${msg.role === 'user' ? 'bg-indigo-600/20' : 'bg-slate-800/20'}`}>
                      {msg.role === 'user' ? <User className="w-4 h-4 text-indigo-400" /> : <Bot className="w-4 h-4 text-slate-400" />}
                   </div>
                   <div className={`flex-1 space-y-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                      <header className="text-[9px] font-black uppercase tracking-widest text-slate-600">{msg.role}</header>
                      <div className={`p-4 rounded-2xl text-[13px] leading-relaxed inline-block shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-indigo-600/10 text-slate-200 rounded-tr-none border border-indigo-500/20 text-left' 
                          : 'bg-[#121214] text-slate-300 rounded-tl-none border border-white/5'
                      }`}>
                         <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                   </div>
                </div>
              ))}
           </div>
        )}

        {tab === 'system' && (
          <div className="p-10 max-w-5xl mx-auto">
             <div className="bg-[#0c0c0e] border border-white/5 rounded-2xl p-8 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600/40" />
                <div className="flex items-center gap-2 mb-6 text-slate-500">
                   <Code className="w-4 h-4" />
                   <span className="text-[10px] font-black uppercase tracking-widest">Injection Payload</span>
                </div>
                <div className="mono text-[12px] leading-relaxed text-slate-400 whitespace-pre-wrap selection:bg-indigo-500/30">
                   {entry.messages.find(m => m.role === 'system')?.content || entry.chatml || entry.messages[0]?.content || "Payload empty..."}
                </div>
             </div>
          </div>
        )}

        {tab === 'raw' && (
          <div className="p-10">
             <pre className="p-8 bg-[#0c0c0e] border border-white/5 rounded-2xl mono text-[11px] text-indigo-400 leading-relaxed overflow-x-auto selection:bg-indigo-500/30">
               {JSON.stringify(entry, null, 2)}
             </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;