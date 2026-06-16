import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2, Stethoscope } from 'lucide-react';
import axios from 'axios';

interface SidebarProps {
  apiBaseUrl: string;
}

export function Sidebar({ apiBaseUrl }: SidebarProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const response = await axios.post(`${apiBaseUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      if (response.status === 200) {
        setUploadStatus({ type: 'success', message: `Processed: ${file.name}` });
      } else {
        setUploadStatus({ type: 'error', message: 'Failed to upload document.' });
      }
    } catch (error) {
      console.error(error);
      setUploadStatus({ type: 'error', message: 'Connection to backend failed.' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <Stethoscope size={24} color="var(--accent-cyan)" /> 
        <h2>Clinical Context</h2>
      </div>
      
      <p className="sidebar-desc">
        Expand the AI's knowledge base by securely uploading medical literature or clinical PDFs.
      </p>

      <div className="upload-section">
        <input 
          type="file" 
          accept=".pdf" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleFileChange}
        />
        
        <div 
          className="upload-zone" 
          onClick={() => !isUploading && fileInputRef.current?.click()}
          style={{ opacity: isUploading ? 0.5 : 1, cursor: isUploading ? 'not-allowed' : 'pointer' }}
        >
          {isUploading ? (
            <Loader2 className="animate-spin" size={32} color="var(--accent-cyan)" />
          ) : (
            <UploadCloud size={32} />
          )}
          <span className="upload-text">
            {isUploading ? 'Processing Document...' : 'Select Medical PDF'}
          </span>
          {!isUploading && <span className="upload-subtext">Max size: 50MB</span>}
        </div>

        {uploadStatus && (
          <div className={`upload-status ${uploadStatus.type}`}>
            {uploadStatus.message}
          </div>
        )}
      </div>

      <div className="disclaimer">
        <strong>Disclaimer</strong><br />
        This system serves as an educational and analytical tool. It is not a substitute for formal professional medical advice or diagnosis.
      </div>
    </aside>
  );
}
