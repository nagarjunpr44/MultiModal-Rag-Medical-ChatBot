import os
import json
import fitz # PyMuPDF
from typing import List
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.infrastructure.vectordb import vector_db

class DocumentProcessor:
    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
            add_start_index=True,
        )
        self.collection = vector_db.get_collection()
        
        # Directory to save extracted images for Chroma to reference
        self.images_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "images")
        os.makedirs(self.images_dir, exist_ok=True)

    def extract_images(self, file_path: str) -> List[str]:
        """Extracts images from a PDF and saves them to disk."""
        doc = fitz.open(file_path)
        image_paths = []
        base_name = os.path.basename(file_path)
        
        for i in range(len(doc)):
            page = doc[i]
            image_list = page.get_images(full=True)
            for img_index, img in enumerate(image_list):
                xref = img[0]
                base_image = doc.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]
                image_path = os.path.join(self.images_dir, f"{base_name}_page{i}_img{img_index}.{image_ext}")
                
                with open(image_path, "wb") as f:
                    f.write(image_bytes)
                image_paths.append(image_path)
                
        return image_paths

    def process_pdf(self, file_path: str):
        """Loads a PDF, extracts text and images, and stores them in the Multimodal Vector DB."""
        print(f"Processing document: {file_path}")
        
        # 1. Process Text
        loader = PyMuPDFLoader(file_path)
        docs = loader.load()
        chunks = self.text_splitter.split_documents(docs)
        
        texts = [chunk.page_content for chunk in chunks]
        text_metadatas = [chunk.metadata for chunk in chunks]
        text_ids = [f"{os.path.basename(file_path)}_text_{i}" for i in range(len(chunks))]

        # 2. Process Images
        image_uris = self.extract_images(file_path)
        image_ids = [f"{os.path.basename(file_path)}_img_{i}" for i in range(len(image_uris))]
        image_metadatas = [{"source": file_path, "type": "image"} for _ in image_uris]
        
        # 3. Insert into Vector Database
        # Chroma's OpenCLIP function handles both texts and URIs simultaneously if needed,
        # but inserting them separately is cleaner.
        
        if texts:
            self.collection.add(documents=texts, metadatas=text_metadatas, ids=text_ids)
            print(f"Inserted {len(texts)} text chunks.")
            
            # Save texts to a global corpus for BM25 (Sparse) Retrieval
            corpus_path = os.path.join(os.path.dirname(self.images_dir), "corpus.json")
            corpus = []
            if os.path.exists(corpus_path):
                try:
                    with open(corpus_path, "r") as f:
                        corpus = json.load(f)
                except json.JSONDecodeError:
                    pass
            corpus.extend(texts)
            with open(corpus_path, "w") as f:
                json.dump(corpus, f)
            print("Updated BM25 corpus.")
            
        if image_uris:
            self.collection.add(uris=image_uris, metadatas=image_metadatas, ids=image_ids)
            print(f"Inserted {len(image_uris)} extracted images.")

document_processor = DocumentProcessor()
