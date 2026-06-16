"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "./textarea";
import { Button } from "./button";
import { cn } from "../../lib/utils";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import {
  FileUp,
  ArrowUpIcon,
  Paperclip,
  Stethoscope,
  Loader2,
  Activity,
  Syringe,
  FileText,
} from "lucide-react";

interface AutoResizeProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: AutoResizeProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }

      textarea.style.height = `${minHeight}px`; // reset first
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Infinity)
      );
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`;
  }, [minHeight]);

  return { textareaRef, adjustHeight };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export default function RuixenMoonChat() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 48,
    maxHeight: 150,
  });

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    setMessage("");
    adjustHeight(true);
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/chat`, { query: userMessage });
      if (response.status === 200) {
        const answer = response.data.response || "No response received.";
        setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: "Backend Error: Received unexpected status code." }]);
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [...prev, { role: 'assistant', content: "Failed to connect to the backend server. Is FastAPI running?" }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
    <div
      className="relative w-full h-screen bg-cover bg-center flex flex-col items-center justify-between overflow-hidden"
      style={{
        backgroundImage: "url('/medical_bg.png')",
        backgroundAttachment: "fixed",
      }}
    >
      {/* Hidden File Input */}
      <input 
        type="file" 
        accept=".pdf" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleFileChange}
      />

      {messages.length === 0 ? (
        /* Centered AI Title for empty state */
        <div className="flex-1 w-full flex flex-col items-center justify-center">
          <div className="text-center">
            <Stethoscope size={64} className="mx-auto mb-4 text-cyan-400 opacity-80" />
            <h1 className="text-4xl font-semibold text-white drop-shadow-sm">
              Medical RAG AI
            </h1>
            <p className="mt-2 text-neutral-300 max-w-md mx-auto">
              Consult the clinical knowledge base. Start typing a medical query or upload a PDF document to expand the context.
            </p>
          </div>
        </div>
      ) : (
        /* Chat Log Area */
        <div className="flex-1 w-full max-w-4xl overflow-y-auto px-4 py-8 flex flex-col gap-6" style={{ scrollbarWidth: 'thin' }}>
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
                    className="w-full h-full rounded-full object-cover shadow-md border border-neutral-700/50" 
                  />
                </div>
                <div className={cn(
                  "p-4 rounded-2xl shadow-sm",
                  msg.role === 'user' 
                    ? "bg-cyan-900/40 border border-cyan-800/50 text-neutral-100 rounded-tr-sm" 
                    : "bg-black/60 backdrop-blur-md border border-neutral-700 text-neutral-200 rounded-tl-sm"
                )}>
                  <div className="prose prose-invert prose-sm max-w-none">
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
                  <img src="/doctor_icon.png" alt="Doctor" className="w-full h-full rounded-full object-cover shadow-md border border-neutral-700/50" />
                </div>
                <div className="p-4 rounded-2xl bg-black/60 backdrop-blur-md border border-neutral-700 text-neutral-200 rounded-tl-sm flex items-center h-[52px]">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={endOfMessagesRef} className="h-4 w-full" />
        </div>
      )}

      {/* Input Box Section */}
      <div className="w-full max-w-3xl mb-8 mt-auto px-4">
        
        {/* Upload Status Toast */}
        {uploadStatus && (
          <div className={cn(
            "mb-4 p-3 rounded-lg text-sm text-center border animate-in fade-in slide-in-from-bottom-2",
            uploadStatus.type === 'success' 
              ? "bg-green-500/10 border-green-500/20 text-green-400" 
              : "bg-red-500/10 border-red-500/20 text-red-400"
          )}>
            {uploadStatus.message}
          </div>
        )}

        <div className="relative bg-black/70 backdrop-blur-lg rounded-2xl border border-neutral-700 shadow-2xl transition-all focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/50">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
              setMessage(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type your medical query..."
            className={cn(
              "w-full px-5 py-4 resize-none border-none",
              "bg-transparent text-white text-base",
              "focus-visible:ring-0 focus-visible:ring-offset-0",
              "placeholder:text-neutral-500 min-h-[48px]"
            )}
            style={{ overflow: "hidden" }}
          />

          {/* Footer Buttons */}
          <div className="flex items-center justify-between p-2 pl-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-full transition-colors"
              onClick={() => fileInputRef.current?.click()}
              title="Upload PDF Document"
            >
              <Paperclip className="w-5 h-5" />
            </Button>

            <div className="flex items-center gap-2">
              <Button
                onClick={handleSend}
                disabled={!message.trim() || isLoading}
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300",
                  message.trim() && !isLoading
                    ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:scale-105 shadow-lg shadow-cyan-500/25"
                    : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                )}
              >
                <ArrowUpIcon className="w-5 h-5" />
                <span className="sr-only">Send</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Quick Actions (only show when empty to save space, or always show if preferred. We'll show when empty) */}
        {messages.length === 0 && (
          <div className="flex items-center justify-center flex-wrap gap-3 mt-8">
            <QuickAction 
              icon={isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />} 
              label={isUploading ? "Uploading..." : "Upload Clinical PDF"} 
              onClick={() => !isUploading && fileInputRef.current?.click()}
            />
            <QuickAction icon={<Activity className="w-4 h-4" />} label="Symptom Check" onClick={() => setMessage("What are the common symptoms of... ")} />
            <QuickAction icon={<Syringe className="w-4 h-4" />} label="Treatment Protocols" onClick={() => setMessage("What is the standard treatment protocol for... ")} />
            <QuickAction icon={<FileText className="w-4 h-4" />} label="Summarize Document" onClick={() => setMessage("Summarize the key findings from the recently uploaded document.")} />
          </div>
        )}
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
      className="flex items-center gap-2 rounded-full border-neutral-700/60 bg-black/40 backdrop-blur-sm text-neutral-300 hover:text-white hover:bg-neutral-800 hover:border-neutral-600 transition-all shadow-sm"
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </Button>
  );
}
