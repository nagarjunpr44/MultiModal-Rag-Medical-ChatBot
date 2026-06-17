import base64
import os
import json
from typing import List
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from app.models.db_models import ChatMessage
from langchain_community.retrievers import BM25Retriever
from app.infrastructure.vectordb import vector_db
from app.core.config import settings
from sentence_transformers import CrossEncoder

def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

class RAGService:
    def __init__(self):
        # Initialize Groq Vision LLM
        self.llm = ChatGroq(
            temperature=0, 
            groq_api_key=settings.GROQ_API_KEY, 
            model_name="meta-llama/llama-4-scout-17b-16e-instruct"
        )
        self.collection = vector_db.get_collection()
        
        # Initialize Cross-Encoder for text re-ranking
        self.reranker = CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2', max_length=512)
        
        # Load BM25 Retriever if corpus exists
        corpus_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "corpus.json")
        self.bm25_retriever = None
        if os.path.exists(corpus_path):
            try:
                with open(corpus_path, "r") as f:
                    corpus = json.load(f)
                if corpus:
                    self.bm25_retriever = BM25Retriever.from_texts(corpus)
            except Exception as e:
                print(f"Failed to load BM25 corpus: {e}")

    def get_answer(self, question: str, n_results: int = 3) -> str:
        # Retrieve a larger pool of candidates for the first stage
        initial_k = max(15, n_results * 5)
        results = self.collection.query(
            query_texts=[question],
            n_results=initial_k,
            include=['documents', 'uris', 'metadatas']
        )
        
        candidate_texts = []
        image_paths = []
        
        # Chroma returns lists of lists
        doc_list = results.get("documents", [[]])[0]
        uri_list = results.get("uris", [[]])[0]
        
        for doc, uri in zip(doc_list, uri_list):
            if doc is not None:
                candidate_texts.append(doc)
            if uri is not None and uri not in image_paths:
                image_paths.append(uri)
                
        # Sparse Retrieval (BM25)
        if self.bm25_retriever:
            self.bm25_retriever.k = initial_k
            bm25_docs = self.bm25_retriever.invoke(question)
            for d in bm25_docs:
                if d.page_content not in candidate_texts:
                    candidate_texts.append(d.page_content)
                
        # Stage 2: Re-rank the retrieved text candidates
        if candidate_texts:
            # Pair query with each text chunk for the Cross-Encoder
            cross_inp = [[question, text] for text in candidate_texts]
            scores = self.reranker.predict(cross_inp)
            
            # Sort by predicted relevance score (descending)
            scored_texts = sorted(zip(scores, candidate_texts), key=lambda x: x[0], reverse=True)
            
            # Select the top n_results
            texts = [text for score, text in scored_texts[:n_results]]
        else:
            texts = []
            
        # Select top N images to avoid context overflow
        image_paths = image_paths[:n_results]
                
        context_text = "\n\n---\n\n".join(texts) if texts else "No relevant medical text documents found."
        
        system_content = f"""You are an empathetic, highly capable clinical AI assistant designed to support medical professionals and patients.
        
        Instructions:
        1. Prioritize the provided Context Text and Context Images to answer the user's question accurately.
        2. You may use your general medical knowledge to clarify, explain, or elaborate on the context to make the answer more helpful, but you must not contradict the provided context.
        3. If the context is entirely irrelevant to the question, you may answer using your own knowledge, but gracefully mention that the specific documents did not cover this topic.
        4. Do NOT start your answers with phrases like "According to the provided context" or "Based on the text". Answer directly, confidently, and professionally, as a caring doctor would.
        5. Maintain a warm, empathetic, yet highly professional clinical tone.
        6. You MUST include a medical disclaimer at the absolute end of your response. It MUST be separated from the rest of your response by exactly one blank line, a markdown horizontal rule (---), and another blank line.
        
        Example formatting for the disclaimer:
        [Your clinical response here]
        
        ---
        
        *Disclaimer: I am an AI assistant. This information is for educational and clinical support purposes only and does not constitute professional medical advice, diagnosis, or treatment.*
        
        Context Text:
        {context_text}"""
        
        # Construct the Human Message (Multimodal)
        human_content = [{"type": "text", "text": question}]
        
        # Attach all retrieved images to the prompt
        for img_path in image_paths:
            if os.path.exists(img_path):
                base64_image = encode_image(img_path)
                human_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{base64_image}"}
                })
        
        messages = [
            SystemMessage(content=system_content),
            HumanMessage(content=human_content)
        ]
        
        # Generate Answer
        response = self.llm.invoke(messages)
        return response.content

    def get_answer_stream(self, question: str, n_results: int = 3, session_id: str = None, db = None):
        # Get past messages if session exists
        past_msgs = []
        if session_id and db:
            past_msgs = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at).all()
            
        # Save current user message to DB
        if session_id and db:
            user_msg = ChatMessage(session_id=session_id, role="user", content=question)
            db.add(user_msg)
            db.commit()

        # Retrieve a larger pool of candidates for the first stage
        initial_k = max(15, n_results * 5)
        results = self.collection.query(
            query_texts=[question],
            n_results=initial_k,
            include=['documents', 'uris', 'metadatas']
        )
        
        candidate_texts = []
        image_paths = []
        
        # Chroma returns lists of lists
        doc_list = results.get("documents", [[]])[0]
        uri_list = results.get("uris", [[]])[0]
        
        for doc, uri in zip(doc_list, uri_list):
            if doc is not None:
                candidate_texts.append(doc)
            if uri is not None and uri not in image_paths:
                image_paths.append(uri)
                
        # Sparse Retrieval (BM25)
        if self.bm25_retriever:
            self.bm25_retriever.k = initial_k
            bm25_docs = self.bm25_retriever.invoke(question)
            for d in bm25_docs:
                if d.page_content not in candidate_texts:
                    candidate_texts.append(d.page_content)
                
        # Stage 2: Re-rank the retrieved text candidates
        if candidate_texts:
            # Pair query with each text chunk for the Cross-Encoder
            cross_inp = [[question, text] for text in candidate_texts]
            scores = self.reranker.predict(cross_inp)
            
            # Sort by predicted relevance score (descending)
            scored_texts = sorted(zip(scores, candidate_texts), key=lambda x: x[0], reverse=True)
            
            # Select the top n_results
            texts = [text for score, text in scored_texts[:n_results]]
        else:
            texts = []
            
        # Select top N images to avoid context overflow
        image_paths = image_paths[:n_results]
                
        context_text = "\n\n---\n\n".join(texts) if texts else "No relevant medical text documents found."
        
        system_content = f"""You are an empathetic, highly capable clinical AI assistant designed to support medical professionals and patients.
        
        Instructions:
        1. Prioritize the provided Context Text and Context Images to answer the user's question accurately.
        2. You may use your general medical knowledge to clarify, explain, or elaborate on the context to make the answer more helpful, but you must not contradict the provided context.
        3. If the context is entirely irrelevant to the question, you may answer using your own knowledge, but gracefully mention that the specific documents did not cover this topic.
        4. Do NOT start your answers with phrases like "According to the provided context" or "Based on the text". Answer directly, confidently, and professionally, as a caring doctor would.
        5. Maintain a warm, empathetic, yet highly professional clinical tone.
        6. You MUST include a medical disclaimer at the absolute end of your response. It MUST be separated from the rest of your response by exactly one blank line, a markdown horizontal rule (---), and another blank line.
        
        Example formatting for the disclaimer:
        [Your clinical response here]
        
        ---
        
        *Disclaimer: I am an AI assistant. This information is for educational and clinical support purposes only and does not constitute professional medical advice, diagnosis, or treatment.*
        
        Context Text:
        {context_text}"""
        
        # Construct the Human Message (Multimodal)
        human_content = [{"type": "text", "text": question}]
        
        # Attach all retrieved images to the prompt
        for img_path in image_paths:
            if os.path.exists(img_path):
                base64_image = encode_image(img_path)
                human_content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{base64_image}"}
                })
        
        messages = [
            SystemMessage(content=system_content),
        ]
        
        # Inject Chat History
        for pm in past_msgs:
            if pm.role == "user":
                messages.append(HumanMessage(content=pm.content))
            else:
                messages.append(AIMessage(content=pm.content))
                
        # Current question (multimodal with images)
        messages.append(HumanMessage(content=human_content))
        
        # Stream Answer
        full_response = ""
        for chunk in self.llm.stream(messages):
            if chunk.content:
                full_response += chunk.content
                yield f"data: {json.dumps({'content': chunk.content})}\n\n"
                
        # Save assistant message to DB
        if session_id and db:
            ai_msg = ChatMessage(session_id=session_id, role="assistant", content=full_response)
            db.add(ai_msg)
            db.commit()


# Singleton instance
rag_service = RAGService()
