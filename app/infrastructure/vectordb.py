import chromadb
from chromadb.config import Settings
from chromadb.utils.embedding_functions import OpenCLIPEmbeddingFunction
from chromadb.utils.data_loaders import ImageLoader
from app.core.config import settings

class ChromaDBClient:
    def __init__(self):
        # Initialize the local persistent ChromaDB client
        self.client = chromadb.PersistentClient(
            path=settings.CHROMA_PERSIST_DIRECTORY,
            settings=Settings(anonymized_telemetry=False)
        )
        
        # Initialize OpenCLIP and ImageLoader for Multimodal support
        self.embedding_function = OpenCLIPEmbeddingFunction()
        self.data_loader = ImageLoader()
        
        # Create a completely new collection specifically for multimodal embeddings
        self.collection_name = "multimodal_knowledge_base"
        self.collection = self.client.get_or_create_collection(
            name=self.collection_name,
            embedding_function=self.embedding_function,
            data_loader=self.data_loader,
            metadata={"hnsw:space": "cosine"}
        )

    def get_collection(self):
        return self.collection

# Singleton instance
vector_db = ChromaDBClient()
