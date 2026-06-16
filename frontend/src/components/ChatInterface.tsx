import React, { useState, useRef, useEffect } from 'react';
import { Send, Stethoscope } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatInterfaceProps {
  apiBaseUrl: string;
}

export function ChatInterface({ apiBaseUrl }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await axios.post(`${apiBaseUrl}/chat`, { query: userMessage });
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

  return (
    <main className="main-content">
      <header className="header">
        <h1>Medical Query Interface</h1>
        <div className="header-status">
          <div className="status-dot"></div>
          System Online
        </div>
      </header>

      <div className="chat-feed">
        {messages.length === 0 && (
          <div className="welcome-screen">
            <Stethoscope size={56} style={{ marginBottom: '1.5rem', color: 'var(--accent-cyan)', opacity: 0.8 }} />
            <h2>Ready for Query</h2>
            <p>Enter clinical symptoms or medical questions below. The system will consult the ingested knowledge base.</p>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} className={`message-band animate-entry ${msg.role}`}>
            <div className="message-container">
              <div className="avatar-wrapper">
                {msg.role === 'user' ? (
                  <img src="/user_icon.png" alt="User" className="avatar" />
                ) : (
                  <img src="/doctor_icon.png" alt="Doctor" className="avatar" />
                )}
              </div>
              <div className="message-content">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="message-band assistant animate-entry">
            <div className="message-container">
              <div className="avatar-wrapper">
                <img src="/doctor_icon.png" alt="Doctor" className="avatar" />
              </div>
              <div className="message-content" style={{ display: 'flex', alignItems: 'center' }}>
                <div className="typing-indicator">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      <div className="floating-input-wrapper">
        <div className="input-box">
          <textarea
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your medical query..."
            rows={1}
          />
          <button 
            className="send-btn" 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </main>
  );
}
