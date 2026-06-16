# Multi-Modal Medical Chatbot - Project Tracker

This document serves as a detailed ledger of the project's development phases, architectural decisions, challenges faced, and successful implementations.

---

## Phase 1: Project Setup & System Design

**Goal:** Establish a robust, enterprise-grade foundation using Clean Architecture principles to ensure scalability and maintainability.

**What We Did:**
*   **Initialized Git Repository:** Set up version control.
*   **Virtual Environment:** Created an isolated `.venv` to prevent dependency conflicts.
*   **Directory Structure:** Implemented a decoupled architecture:
    *   `app/api/`: For FastAPI routing and endpoints.
    *   `app/core/`: For configuration and security.
    *   `app/services/`: For LangChain business logic.
    *   `app/infrastructure/`: For external integrations (VectorDB, Groq).
    *   `app/models/`: For Pydantic schemas.
*   **Configuration Management:** Used `pydantic-settings` to manage environment variables (`.env`) in a type-safe manner, specifically setting up the `GROQ_API_KEY` requirement.
*   **Dependency Management:** Migrated from standard `pip` to **`uv`** (by Astral) for lightning-fast virtual environment creation and package resolution.
*   **Core Dependencies:** Installed `fastapi`, `uvicorn`, `langchain`, `langchain-groq`, `chromadb`, `streamlit`, and `PyMuPDF`.

**What Worked Well:**
*   Pydantic settings loaded the Groq API key seamlessly.
*   The folder structure clearly separates concerns, preventing spaghetti code as the project grows.

**Challenges / Design Decisions:**
*   *Decision:* Chose Groq over OpenAI/Gemini for ultra-fast text inference.
*   *Decision:* Deferred native multimodal (image) embedding in ChromaDB to focus on text first, as Groq currently excels in text generation.

---

## Phase 2: Data Ingestion Pipeline

**Goal:** Build a robust pipeline to parse medical PDFs, chunk the text semantically, and embed it into a local Vector Database.

**What We Did:**
*   **Vector Database Setup (`app/infrastructure/vectordb.py`):** Configured a local, persistent ChromaDB instance.
*   **Document Processor (`app/services/document_processor.py`):**
    *   Used `PyMuPDFLoader` to extract text from medical PDFs.
    *   Implemented `RecursiveCharacterTextSplitter` (chunk_size=1000, overlap=200) to ensure clinical sentences are not severed inappropriately.
*   **Ingestion Script (`scripts/ingest_data.py`):** Wrote a CLI tool to iterate through `data/raw/` and process all PDFs into ChromaDB automatically.

**What Worked Well:**
*   ChromaDB's default `all-MiniLM-L6-v2` embedding model automatically handled text embeddings without requiring an external API call or key, saving costs during development.
*   The `ingest_data.py` script successfully executed and ingested the test PDF.

**Challenges / Design Decisions:**
*   *Challenge:* Handling images from PDFs. Currently, we are extracting the *text* of the PDFs. To achieve true multimodality later, we will need to implement a dedicated Vision-Language Model (like LLaVA) or extract and OCR images specifically.

---

## Phase 3: Core RAG Logic

**Goal:** Connect the Vector DB to Groq via LangChain to retrieve context and generate grounded answers.

**Status:** Completed.

**What We Did:**
*   **RAG Service (`app/services/rag_service.py`):** Created the central orchestrator that glues the database and the LLM together.
*   **Groq Integration:** Initialized `ChatGroq` utilizing the `llama3-8b-8192` model. Llama 3 on Groq is chosen for its near-instantaneous token generation speed.
*   **Direct DB Querying:** Rather than using LangChain's vectorstore wrapper (which can be fragile and forces tight coupling), we used the raw ChromaDB client `vector_db.collection.query()` to fetch the documents.
*   **Prompt Engineering:** Designed a strict system prompt using `ChatPromptTemplate` that forces the LLM to adhere ONLY to the retrieved context and mandates a medical disclaimer on every response.
*   **LCEL Pipeline:** Built the chain using LangChain Expression Language (`prompt | llm | StrOutputParser()`).

**What Worked Well:**
*   Bypassing the LangChain `Chroma` wrapper in favor of the raw `chromadb.query()` method dramatically simplified the architecture and avoided dependency conflicts with embedding models.

**Challenges / Design Decisions:**
*   *Decision (Decoupling):* Kept the RAG service entirely ignorant of FastAPI or Streamlit. It strictly takes a `string` (question) and returns a `string` (answer). This Clean Architecture approach means we could swap our FastAPI backend for Django tomorrow and this file wouldn't need a single change.

---

## Phase 4: FastAPI Backend

**Goal:** Expose the LangChain RAG Core via asynchronous RESTful API endpoints for external clients (like Streamlit) to consume.

**What We Did:**
*   **Pydantic Models (`app/models/chat.py`):** Created `ChatRequest` and `ChatResponse` to strictly validate incoming queries and outgoing answers.
*   **Chat Endpoint (`app/api/endpoints/chat.py`):** Built a `POST /api/chat` route that injects the `rag_service`. Due to FastAPI's async nature, it can route multiple concurrent requests efficiently.
*   **Upload Endpoint (`app/api/endpoints/upload.py`):** Built a `POST /api/upload` route utilizing `UploadFile`. It temporarily saves an uploaded PDF and triggers the `document_processor` to embed it into ChromaDB in real-time.
*   **Router Integration (`app/main.py`):** Wired both endpoints into the main application under the `/api` prefix.

**What Worked Well:**
*   The Clean Architecture paid off here. Building the API took almost no logic; we simply called `rag_service.get_answer()` and `document_processor.process_pdf()`. The API layer remains incredibly thin and focused only on HTTP semantics.

**Challenges / Design Decisions:**
*   *Decision:* Handled file uploads directly through FastAPI rather than relying on a third-party bucket (like S3) for the MVP, to keep the local development loop fast and self-contained.

---

## Phase 5: Streamlit Frontend Integration

**Goal:** Create a professional, user-friendly graphical interface that connects to the FastAPI backend.

**What We Did:**
*   **Chat Interface (`frontend/app.py`):** Built a medical chatbot UI using Streamlit's native `st.chat_message` and `st.chat_input` components.
*   **Session State:** Leveraged `st.session_state` to store and display the full history of the conversation during the user's session.
*   **File Uploader Widget:** Added a sidebar allowing users to upload PDFs directly from the UI. This hits the FastAPI `/api/upload` endpoint, making the ingestion process completely seamless for end-users.
*   **UX Enhancements:** Added custom CSS for a darker, more professional medical aesthetic, implemented loading spinners, and added a simulated "typing" effect for the LLM response to improve perceived performance.

**What Worked Well:**
*   Streamlit proved to be exceptionally fast for MVP UI development. Because our backend was already decoupled, hooking the UI up to the API took minimal effort.

**Challenges / Design Decisions:**
*   *Decision:* Instead of importing the LangChain logic directly into Streamlit (which many basic tutorials do), we made Streamlit communicate *exclusively* via HTTP requests to our FastAPI backend. This proves the microservice architecture works and allows us to swap Streamlit for a Next.js/React frontend in the future with zero backend changes.

---

## True Multi-Modal RAG Upgrade

**Goal:** Upgrade the system to support True Multi-Modal Retrieval-Augmented Generation, where both text and images from clinical PDFs are embedded, searched, and interpreted by a Vision LLM.

**What We Did:**
*   **OpenCLIP Integration (`app/infrastructure/vectordb.py`):** Replaced the default text-only embedding model with `OpenCLIPEmbeddingFunction` and `ImageLoader`. Created a new collection `multimodal_knowledge_base` to store these complex vectors.
*   **Image Extraction (`app/services/document_processor.py`):** Rewrote the ingestion pipeline to use `fitz` (PyMuPDF) to iterate through uploaded PDFs, extract raw image bytes, save them to a local `data/images/` directory, and pass their URIs to ChromaDB alongside the text chunks.
*   **Vision LLM & Dynamic Prompting (`app/services/rag_service.py`):** 
    *   Upgraded the Groq model to `llama-3.2-11b-vision-preview`.
    *   Updated the query logic to request both `documents` (text) and `uris` (images) from ChromaDB.
    *   Built a dynamic LangChain `HumanMessage` that Base64 encodes the retrieved images on-the-fly and attaches them to the prompt alongside the retrieved text.

**What Worked Well:**
*   ChromaDB's native support for URIs and ImageLoaders made it incredibly easy to bridge the gap between file storage and vector retrieval without bloating the database with raw image blobs.

**Challenges / Design Decisions:**
*   *Challenge:* The old database collection was incompatible because OpenCLIP generates vectors with a different dimensionality than the standard sentence-transformer.
*   *Decision:* Created a dedicated `multimodal_knowledge_base` collection to ensure clean separation of data. Any previously ingested PDFs need to be re-uploaded to be processed into the new multimodal space.

---

## Phase 6: Refinement & Productionization

**Goal:** Package the entire microservice architecture into Docker containers so it can be deployed anywhere (AWS, GCP, local servers) with a single command.

**What We Did:**
*   **Dockerfiles (`Dockerfile.api` & `Dockerfile.frontend`):** Created lightweight, isolated environments based on `python:3.11-slim` for both the backend and frontend. We utilized `uv` inside Docker for incredibly fast dependency resolution.
*   **Docker Compose (`docker-compose.yml`):** Networked the API and the Frontend together. We defined a dependency map so the frontend only starts after the API is ready.
*   **Volume Mounting:** Mounted the local `./data` and `./chroma_db` directories into the container. This ensures that the vector database and the raw PDFs persist even if the containers are destroyed and recreated.
*   **Networking Configuration:** Updated the Streamlit app to look for the API at the container hostname `http://backend-api:8000/api` using environment variables.
*   **Version Control:** Initialized Git and began frequently committing changes.

**What Worked Well:**
*   The `.dockerignore` file successfully prevented our massive `.venv` folder from being copied into the container, keeping the image sizes manageable.

**Challenges / Design Decisions:**
*   *Decision (Networking):* By injecting `API_BASE_URL` as an environment variable in `docker-compose.yml`, we don't have to change any code when we move from Localhost to Production. Streamlit dynamically knows where to find the backend.

---

## Phase 7: Modern React Frontend Migration

**Goal:** Discard the Streamlit prototype and build a production-ready, custom React Single Page Application (SPA).

**What We Did:**
*   **Vite + React Setup:** Bootstrapped a blazing fast frontend environment using Vite.
*   **UI Frameworks:** Integrated **Tailwind CSS** for utility-first styling and **Shadcn UI** for highly customizable, accessible components.
*   **Design Overhaul:** Designed a premium, dark-mode medical aesthetic featuring glassmorphism elements, custom SVG backgrounds, and smooth micro-animations.
*   **Component Architecture:** Segregated logic into a dedicated chat component (`ruixen-moon-chat.tsx`) supporting auto-resizing textareas and dynamic file uploads.

**What Worked Well:**
*   Moving away from Streamlit allowed for complete control over the layout, animations, and state management, providing a vastly superior user experience.

---

## Phase 8: Real-Time Streaming & Persistent Sessions

**Goal:** Provide ChatGPT-like real-time token streaming and allow users to save and revisit past conversations.

**What We Did:**
*   **Database Integration:** 
    *   Added **SQLAlchemy** and a local **SQLite** database (`medibot.db`) to the backend.
    *   Created `ChatSession` and `ChatMessage` models to track conversation history.
*   **Streaming API (SSE):** 
    *   Refactored the `/chat/stream` endpoint in FastAPI to utilize Python generators and yield Server-Sent Events (SSE).
    *   Rewrote the React frontend to parse incoming streams chunk-by-chunk using the `TextDecoder` Web API.
*   **History Sidebar:** 
    *   Built a smooth slide-out sidebar in the React frontend to list past sessions.
    *   Wired the sidebar up to new FastAPI CRUD endpoints (`/api/sessions`) to instantly load historic context.
*   **Context Injection:** Upgraded `rag_service.py` to automatically fetch past messages from SQLite and inject them into the LangChain context as `HumanMessage` and `AIMessage` objects, giving the LLM true conversational memory.

**Challenges / Design Decisions:**
*   *Challenge:* Handling SSE streams in JavaScript is notoriously tricky, especially when JSON objects get split across network packets. We implemented a robust newline-delimited buffer system in React to ensure incomplete JSON chunks are held safely until fully received.
*   *Decision:* Opted for SQLite over PostgreSQL to keep the application entirely self-contained and easy to run locally without requiring a database container.
