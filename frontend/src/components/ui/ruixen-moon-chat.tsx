"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "./button";
import { ChatInput, ChatInputTextArea, ChatInputSubmit } from "./chat-input";
import { cn } from "../../lib/utils";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import {
  FileUp,
  Paperclip,
  Loader2,
  Activity,
  Syringe,
  FileText,
  Menu,
  Plus,
  Sun,
  Moon,
  Trash2,
} from "lucide-react";


interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export default function RuixenMoonChat() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<{id: string, title: string, created_at: string}[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("theme") === "dark" || 
        (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isStreaming]);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/sessions`);
        setSessions(res.data);
      } catch (err) {
        console.error("Failed to fetch sessions", err);
      }
    };
    fetchSessions();
  }, []);

  const loadSession = async (sessionId: string) => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_BASE_URL}/sessions/${sessionId}/messages`);
      setMessages(res.data);
      setActiveSessionId(sessionId);
      if (window.innerWidth < 768) {
        setIsSidebarOpen(false);
      }
    } catch (err) {
      console.error("Failed to load session", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation(); // prevent loading the session when clicking delete
    try {
      await axios.delete(`${API_BASE_URL}/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (activeSessionId === sessionId) {
        handleNewChat();
      }
    } catch (err) {
      console.error("Failed to delete session", err);
    }
  };

  const handleSend = async () => {
    if (!message.trim() || isLoading || isStreaming) return;

    const userMessage = message.trim();
    setMessage("");
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      let currentSessionId = activeSessionId;
      if (!currentSessionId) {
        // Create session
        const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? "..." : "");
        const res = await axios.post(`${API_BASE_URL}/sessions`, { title });
        currentSessionId = res.data.id;
        setActiveSessionId(currentSessionId);
        setSessions(prev => [res.data, ...prev]);
      }

      const response = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMessage, session_id: currentSessionId }),
      });

      if (!response.ok) {
        throw new Error('Backend Error: Received unexpected status code.');
      }

      setIsStreaming(true);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let firstChunkReceived = false;

      if (reader) {
        let done = false;
        let buffer = '';
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            buffer += decoder.decode(value, { stream: true });
          }
          
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // keep incomplete line
          
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('data:')) {
              const data = trimmedLine.slice(5).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  if (!firstChunkReceived) {
                    firstChunkReceived = true;
                    setIsLoading(false);
                    setMessages((prev) => [...prev, { role: 'assistant', content: parsed.content }]);
                  } else {
                    setMessages((prev) => {
                      const newMessages = [...prev];
                      const lastIndex = newMessages.length - 1;
                      newMessages[lastIndex] = {
                        ...newMessages[lastIndex],
                        content: newMessages[lastIndex].content + parsed.content,
                      };
                      return newMessages;
                    });
                  }
                }
              } catch (e) {
                console.error('Error parsing stream data', e, data);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, { role: 'assistant', content: "Failed to connect to the backend server. Is FastAPI running?" }]);
      setIsLoading(false);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    await uploadFile(file);
    if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset
    }
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadStatus(null);
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      if (response.status === 200) {
        setUploadStatus({ type: 'success', message: `Successfully processed ${file.name}` });
      } else {
        setUploadStatus({ type: 'error', message: 'Failed to upload document.' });
      }
    } catch (error) {
      console.error(error);
      setUploadStatus({ type: 'error', message: 'Failed to connect to backend.' });
    } finally {
      setIsUploading(false);
      // Auto clear upload success message after 5 seconds
      setTimeout(() => setUploadStatus(null), 5000);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-clinical-paper dark:bg-[#09090b] text-clinical-ink dark:text-zinc-300 overflow-hidden font-sans transition-colors duration-300">
      {/* Hidden File Input */}
      <input 
        type="file" 
        accept=".pdf" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleFileChange}
      />

      {/* Persistent Top Navbar */}
      <header className="flex-none h-14 w-full bg-white dark:bg-[#09090b] border-b border-clinical-rule dark:border-white/10 flex items-center justify-between px-6 z-20">
        <div className="flex items-center gap-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="text-clinical-ink/60 hover:text-clinical-ink hover:bg-clinical-rule/50 dark:text-zinc-500 dark:hover:text-white dark:hover:bg-white/5 transition-colors rounded-xl"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3 border-l border-clinical-rule dark:border-white/10 pl-6 h-8">
            <h1 className="text-2xl font-serif text-clinical-ink dark:text-white tracking-tight leading-none mt-1">
              Medi-bot
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-widest text-clinical-scrub dark:text-emerald-400 bg-clinical-scrub/10 dark:bg-emerald-400/10 px-2 py-0.5 mt-1">
              Clinical V.2
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4 border-r border-clinical-rule dark:border-white/10 pr-6 h-8">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="text-clinical-ink/60 hover:text-clinical-ink hover:bg-clinical-rule/50 dark:text-zinc-500 dark:hover:text-white dark:hover:bg-white/5 transition-colors rounded-xl"
            title="Toggle environment"
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      {/* Split-Pane Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar Overlay (Mobile) */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-slate-900/20 z-40 md:hidden backdrop-blur-sm" 
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Slide-out Sidebar */}
        <div 
          className={cn(
            "fixed md:relative top-0 left-0 h-full bg-clinical-paper dark:bg-[#09090b] border-r border-clinical-rule dark:border-white/10 z-50 flex flex-col transition-all duration-300 ease-in-out shrink-0",
            isSidebarOpen ? "w-72 translate-x-0" : "w-0 -translate-x-full md:translate-x-0 md:opacity-0 md:border-transparent md:pointer-events-none"
          )}
        >
          <div className="p-6 border-b border-clinical-rule dark:border-white/10 min-w-[18rem]">
            <Button 
              onClick={handleNewChat}
              className="w-full justify-start gap-3 bg-clinical-ink text-white hover:bg-black dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700 rounded-xl h-12 text-sm font-medium tracking-wide transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" /> New Consult
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 min-w-[18rem]" style={{ scrollbarWidth: 'none' }}>
            <h3 className="text-[10px] font-bold text-clinical-ink/40 dark:text-zinc-600 uppercase tracking-widest mb-4 px-2 mt-2">Patient History</h3>
            {sessions.map(s => (
              <div
                key={s.id}
                className={cn(
                  "w-full p-3 flex items-center justify-between transition-colors duration-200 border-l-2 group",
                  activeSessionId === s.id 
                    ? "bg-white dark:bg-zinc-900 border-clinical-scrub dark:border-emerald-400 text-clinical-ink dark:text-white font-medium shadow-sm" 
                    : "border-transparent text-clinical-ink/70 hover:bg-white/50 hover:text-clinical-ink dark:text-zinc-400 dark:hover:bg-zinc-900/50 dark:hover:text-zinc-200"
                )}
              >
                <button
                  onClick={() => loadSession(s.id)}
                  className="flex flex-1 items-center gap-3 overflow-hidden text-left"
                >
                  <FileText className="w-4 h-4 shrink-0 opacity-50" />
                  <span className="truncate text-sm">{s.title}</span>
                </button>
                <button
                  onClick={(e) => handleDeleteSession(e, s.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-clinical-ink/40 hover:text-clinical-alert dark:text-zinc-500 dark:hover:text-rose-400 transition-all rounded-md hover:bg-clinical-alert/10 dark:hover:bg-rose-400/10"
                  title="Delete Session"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col relative min-w-0 bg-white dark:bg-[#0c0c0e]">
          
          {messages.length === 0 ? (
            /* Centered AI Title for empty state */
            <div className="flex-1 w-full flex flex-col items-center justify-center">
              <div className="text-center mt-8 animate-in fade-in duration-700 max-w-lg px-8">
                <div className="w-full border-b-2 border-clinical-ink dark:border-white/20 pb-6 mb-6">
                  <h1 className="text-6xl font-serif text-clinical-ink dark:text-white tracking-tight mb-4">
                    Clinical Intake
                  </h1>
                  <p className="text-base text-clinical-ink/60 dark:text-zinc-400 font-medium">
                    Secure AI Diagnostic Assistant
                  </p>
                </div>
                <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-clinical-ink/40 dark:text-zinc-600 font-bold mb-8">
                  <span>Authorized Personnel Only</span>
                  <span>End-to-End Encrypted</span>
                </div>
              </div>
            </div>
          ) : (
            /* Chat Log Area */
            <div className="flex-1 w-full max-w-4xl mx-auto overflow-y-auto px-4 py-8 flex flex-col gap-6" style={{ scrollbarWidth: 'thin' }}>
              {messages.map((msg, idx) => (
                <div key={idx} className={cn("flex w-full", msg.role === 'user' ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "flex gap-4 max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300",
                    msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}>
                    <div className="w-10 h-10 shrink-0">
                      <img 
                        src={msg.role === 'user' ? "/user_icon.png" : "/doctor_icon.png"} 
                        alt={msg.role} 
                        className="w-full h-full rounded-full object-cover shadow-sm border border-clinical-rule dark:border-white/10" 
                      />
                    </div>
                    <div className={cn(
                      "p-4 rounded-2xl shadow-sm dark:shadow-md",
                      msg.role === 'user' 
                        ? "bg-clinical-scrub border border-clinical-scrub text-white dark:bg-emerald-600/30 dark:border-emerald-500/30 dark:text-emerald-50 rounded-tr-sm" 
                        : "bg-white border border-clinical-rule text-clinical-ink dark:bg-[#18181b] dark:border-white/10 dark:text-zinc-300 rounded-tl-sm"
                    )}>
                      <div className={cn(
                        "prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-clinical-paper dark:prose-pre:bg-black/50 prose-pre:border prose-pre:border-clinical-rule dark:prose-pre:border-white/10",
                        msg.role === 'user' 
                          ? "prose-invert prose-p:text-white prose-headings:text-white" 
                          : "prose-slate dark:prose-invert prose-headings:font-serif prose-headings:font-normal prose-headings:text-clinical-ink dark:prose-headings:text-white prose-a:text-clinical-scrub dark:prose-a:text-emerald-400 prose-strong:text-clinical-ink dark:prose-strong:text-white prose-hr:border-clinical-rule dark:prose-hr:border-white/10"
                      )}>
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
          
            {isLoading && (
              <div className="flex w-full justify-start">
                <div className="flex gap-4 max-w-[85%] flex-row animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="w-10 h-10 shrink-0">
                    <img src="/doctor_icon.png" alt="Doctor" className="w-full h-full rounded-full object-cover shadow-sm border border-clinical-rule dark:border-white/10" />
                  </div>
                  <div className="p-4 rounded-2xl bg-white border border-clinical-rule text-clinical-ink dark:bg-[#18181b] dark:border-white/10 dark:text-zinc-300 rounded-tl-sm flex items-center h-[52px] shadow-sm dark:shadow-md">
                    <div className="flex items-center gap-3 font-medium">
                      <span className="text-xs uppercase tracking-widest text-clinical-ink/50 dark:text-zinc-500">Diagnosing...</span>
                      {/* CSS EKG/Scanning Waveform imitation */}
                      <div className="flex items-center gap-1">
                        <div className="w-1 h-3 bg-clinical-scrub dark:bg-emerald-400 animate-pulse delay-75"></div>
                        <div className="w-1 h-6 bg-clinical-scrub dark:bg-emerald-400 animate-pulse delay-150"></div>
                        <div className="w-1 h-2 bg-clinical-scrub dark:bg-emerald-400 animate-pulse delay-300"></div>
                        <div className="w-1 h-4 bg-clinical-scrub dark:bg-emerald-400 animate-pulse delay-75"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={endOfMessagesRef} className="h-12 w-full" />
          </div>
        )}

          {/* Input Box Section */}
          <div className="w-full max-w-4xl mx-auto mb-8 mt-auto px-6">
            
            {/* Upload Status Toast */}
            {uploadStatus && (
              <div className={cn(
                "mb-4 p-3 text-sm text-center border animate-in fade-in slide-in-from-bottom-2",
                uploadStatus.type === 'success' 
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300" 
                  : "bg-clinical-alert/10 border-clinical-alert/20 text-clinical-alert dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300"
              )}>
                {uploadStatus.message}
              </div>
            )}

            <div className="relative bg-white dark:bg-zinc-900 border border-clinical-rule dark:border-white/10 rounded-2xl shadow-sm transition-all duration-300 focus-within:border-clinical-ink dark:focus-within:border-zinc-500 focus-within:ring-1 focus-within:ring-clinical-ink dark:focus-within:ring-zinc-500">
              <ChatInput
                variant="default"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onSubmit={handleSend}
                loading={isLoading || isStreaming}
                className="w-full border-none focus-within:ring-0 focus-within:ring-offset-0 bg-transparent p-0"
              >
                <div className="flex items-center justify-between border-b border-clinical-rule dark:border-white/10 px-4 py-2 w-full">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-clinical-ink/50 dark:text-zinc-500">
                    Command Entry
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] uppercase font-bold tracking-widest text-clinical-ink/50 hover:text-clinical-ink dark:text-zinc-500 dark:hover:text-white rounded-md"
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach File"
                  >
                    <Paperclip className="w-3 h-3 mr-1" /> Attach
                  </Button>
                </div>
                
                <ChatInputTextArea 
                  placeholder="Enter clinical query or attach diagnostic report..." 
                  className="w-full px-5 py-4 min-h-[56px] bg-transparent text-clinical-ink dark:text-white text-base font-mono text-sm placeholder:text-clinical-ink/30 dark:placeholder:text-zinc-600 rounded-none border-none focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
                />
                
                <div className="flex items-center justify-end p-2 w-full">
                  <ChatInputSubmit 
                    className={cn(
                      "transition-all duration-300 rounded-full",
                      message.trim() && !isLoading && !isStreaming
                        ? "bg-clinical-ink text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                        : "bg-clinical-rule/50 text-clinical-ink/30 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed"
                    )}
                  />
                </div>
              </ChatInput>
            </div>

            {/* Quick Actions */}
            {messages.length === 0 && (
              <div className="flex items-center justify-center flex-wrap gap-4 mt-8">
                <QuickAction 
                  icon={isUploading ? <Loader2 className="w-4 h-4 animate-spin text-clinical-scrub dark:text-emerald-400" /> : <FileUp className="w-4 h-4 text-clinical-ink dark:text-zinc-400" />} 
                  label={isUploading ? "Uploading..." : "Import PDF"} 
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                />
                <QuickAction icon={<Activity className="w-4 h-4 text-clinical-ink dark:text-zinc-400" />} label="Run Symptom Check" onClick={() => setMessage("What are the common symptoms of... ")} />
                <QuickAction icon={<Syringe className="w-4 h-4 text-clinical-ink dark:text-zinc-400" />} label="View Protocols" onClick={() => setMessage("What is the standard treatment protocol for... ")} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

function QuickAction({ icon, label, onClick }: QuickActionProps) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      className="flex items-center gap-2 rounded-2xl border border-clinical-rule dark:border-white/10 bg-transparent text-clinical-ink/70 dark:text-zinc-400 hover:text-clinical-ink dark:hover:text-white hover:bg-clinical-rule/30 dark:hover:bg-white/5 transition-all shadow-sm"
    >
      {icon}
      <span className="text-[11px] uppercase font-bold tracking-widest">{label}</span>
    </Button>
  );
}
