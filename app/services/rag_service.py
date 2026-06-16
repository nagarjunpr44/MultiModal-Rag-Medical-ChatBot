import base64
import os
from typing import List
from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, SystemMessage
from app.infrastructure.vectordb import vector_db
from app.core.config import settings

def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

class RAGService:
    def __init__(self):
        # Initialize Groq Vision LLM
        self.llm = ChatGroq(
            temperature=0, 
            groq_api_key=settings.GROQ_API_KEY, 
            model_name="llama-3.2-11b-vision-preview"
        )
        self.collection = vector_db.get_collection()

    def get_answer(self, question: str, n_results: int = 3) -> str:
        # Retrieve both texts and image URIs from the multimodal DB
        results = self.collection.query(
            query_texts=[question],
            n_results=n_results,
            include=['documents', 'uris', 'metadatas']
        )
        
        texts = []
        image_paths = []
        
        # Chroma returns lists of lists
        doc_list = results.get("documents", [[]])[0]
        uri_list = results.get("uris", [[]])[0]
        
        for doc, uri in zip(doc_list, uri_list):
            if doc is not None:
                texts.append(doc)
            if uri is not None:
                image_paths.append(uri)
                
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

# Singleton instance
rag_service = RAGService()
