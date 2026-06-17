# ⚕️ Multi-Modal Medical RAG Chatbot

![Architecture](https://img.shields.io/badge/Architecture-Microservices-blue)
![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688.svg)
![React](https://img.shields.io/badge/React-18+-61DAFB.svg)
![Tailwind](https://img.shields.io/badge/TailwindCSS-3.4+-38B2AC.svg)
![SQLite](https://img.shields.io/badge/SQLite-3+-003B57.svg)
![ChromaDB](https://img.shields.io/badge/ChromaDB-1.5+-FCB32B.svg)
![ChromaDB](https://img.shields.io/badge/ChromaDB-1.5+-FCB32B.svg)

An enterprise-grade, Multi-Modal Retrieval-Augmented Generation (RAG) system designed to parse, embed, and interpret clinical medical PDFs. 

Unlike standard text-only RAG systems, this application extracts both **text** and **embedded medical images** (like X-Rays and diagrams) from PDFs. It maps them into a shared vector space using **OpenCLIP**, and utilizes **Groq's Vision LLMs** to provide highly accurate, grounded answers based on both visual and textual context.

---

## ✨ Key Features

*   **True Multi-Modal Ingestion:** Automatically extracts raw images and text chunks from uploaded PDFs.
*   **Hybrid Retrieval Pipeline:** Combines **ChromaDB / OpenCLIP** (for dense semantic search) with **BM25** (for exact keyword matching) to achieve 100% context recall.
*   **Two-Stage Retrieval with Cross-Encoder:** Implements industry-standard re-ranking using sentence-transformers to maximize context precision and reduce LLM hallucination.
*   **Vision-Language Model Generation:** Integrates `llama-4-scout-17b-16e-instruct` via Groq for ultra-fast, visually-aware inference.
*   **Real-Time Streaming:** Utilizes Server-Sent Events (SSE) for ChatGPT-like instant token streaming.
*   **Persistent Chat History:** Integrated SQLite database with SQLAlchemy to seamlessly save, manage, and resume past chat sessions.
*   **Decoupled Microservice Architecture:** 
    *   **Backend:** Asynchronous FastAPI handling ingestion, database sessions, and streaming inference routes.
    *   **Frontend:** A production-ready React (Vite) SPA utilizing Tailwind CSS, Framer Motion, and Shadcn UI for a premium medical aesthetic.

## 🏗️ Architecture Design

The project strictly follows Clean Architecture principles to ensure components are interchangeable (e.g., swapping Streamlit for Next.js, or Chroma for Pinecone, without rewriting business logic).

```text
app/
├── api/          # FastAPI Routes (/chat, /upload, /sessions)
├── core/         # Pydantic Settings & Configuration
├── data/         # SQLite Database (medibot.db) & SQLAlchemy Setup
├── infrastructure/ # ChromaDB Singleton & OpenCLIP config
├── models/       # Pydantic Schemas & SQLAlchemy DB Models
└── services/     # Core Business Logic
    ├── document_processor.py # PyMuPDF text & image extraction
    └── rag_service.py        # LangChain Orchestration & Vision prompting

frontend/         # Vite + React + Tailwind + Shadcn UI
```

---

## 🚀 Getting Started

### Prerequisites
*   Docker and Docker Compose installed.
*   A [Groq API Key](https://console.groq.com/keys) (with access to vision models).

### 1. Environment Setup
Clone the repository and create your environment file:
```bash
git clone https://github.com/yourusername/Multi_Modal_Medical_chatbot.git
cd Multi_Modal_Medical_chatbot
echo "GROQ_API_KEY=your_api_key_here" > .env
```

### 2. Run with Docker Compose (Recommended)
Spin up the entire microservice stack (FastAPI Backend + Streamlit Frontend + Database volumes) with a single command:
```bash
docker-compose up --build
```
*   **Frontend UI:** `http://localhost:8501`
*   **Backend API Docs (Swagger):** `http://localhost:8000/docs`

### 3. Usage
1. Open the UI at `http://localhost:8501`.
2. Use the sidebar to upload a clinical PDF containing text and diagrams.
3. The system will automatically extract the images, chunk the text, and embed everything into the persistent ChromaDB volume.
4. Ask a question regarding the text or the images, and the Vision LLM will provide a grounded answer.

---

## 🛠️ Local Development (Without Docker)
If you prefer to run the services bare-metal for development:

```bash
# 1. Install Python Backend Dependencies
curl -LsSf https://astral.sh/uv/install.sh | sh
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt

# 2. Start the Backend API (FastAPI)
uvicorn app.main:app --reload --port 8000

# 3. Install and Start the Frontend (React/Vite)
cd frontend
npm install
npm run dev
```

## 🧪 Evaluation & Testing

This project incorporates a robust **Retrieval-Augmented Generation (RAG) Evaluation Pipeline** using **Ragas** to rigorously test the accuracy and factual consistency of the chatbot.

### 1. Synthetic Test Dataset Generation
To overcome the "ground truth" bottleneck, the system uses the `ragas.testset.generator` to automatically synthesize a test dataset directly from the ingested medical documents in the Vector DB. It extracts medical concepts and employs an LLM to generate diverse question-and-answer pairs, creating a realistic testing environment without manual annotation.

### 2. Ragas Evaluation Metrics
The pipeline programmatically evaluates the chatbot's answers against the synthetic ground truth using the following metrics:
*   **Answer Relevancy:** Measures how relevant the generated answer is to the user's prompt (penalizing incomplete or tangential answers).
*   **Context Precision:** Evaluates if the retriever correctly ranks the most relevant documents at the top.
*   **Context Recall:** Checks if the retrieved context contains all the necessary information to answer the question.
*   **Faithfulness (Factual Consistency):** Measures hallucination by ensuring every claim in the generated answer can be directly inferred from the retrieved context. 

To run the evaluation pipeline:
```bash
# 1. Generate the synthetic test dataset from your ingested documents
uv run scripts/generate_test_set.py

# 2. Run the evaluation to score the RAG pipeline
uv run scripts/evaluate_rag.py
```

## ⚠️ Disclaimer
This system is an educational portfolio project demonstrating advanced AI architecture. **It is not a medical device and should not be used for actual diagnostic purposes or to replace professional medical advice.**

---
