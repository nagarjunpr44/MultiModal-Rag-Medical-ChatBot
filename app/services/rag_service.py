import base64
import os
import json
from typing import List
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
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
        
        # Construct the System Message
        system_content = f"""You are a highly capable medical assistant. Your primary directive is to answer the user's questions based ONLY on the provided Context (which may include text and images). 
        Strict Rules:
        1. If the answer is not contained within the Context or images, state: 'I cannot find the answer in the provided medical documents.'
        2. Always include a disclaimer that this is not professional medical advice.
        
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

    def get_answer_stream(self, question: str, n_results: int = 3):
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
        
        # Construct the System Message
        system_content = f"""You are a highly capable medical assistant. Your primary directive is to answer the user's questions based ONLY on the provided Context (which may include text and images). 
        Strict Rules:
        1. If the answer is not contained within the Context or images, state: 'I cannot find the answer in the provided medical documents.'
        2. Always include a disclaimer that this is not professional medical advice.
        
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
        
        # Stream Answer
        for chunk in self.llm.stream(messages):
            if chunk.content:
                yield f"data: {json.dumps({'content': chunk.content})}\n\n"


# Singleton instance
rag_service = RAGService()
