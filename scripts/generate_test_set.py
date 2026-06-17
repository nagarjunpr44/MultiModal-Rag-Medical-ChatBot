import os
import json
import pandas as pd
from dotenv import load_dotenv
from langchain_core.documents import Document
from ragas.testset import TestsetGenerator
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

# Load environment variables
load_dotenv()

def load_corpus():
    corpus_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "corpus.json")
    documents = []
    if os.path.exists(corpus_path):
        with open(corpus_path, "r") as f:
            texts = json.load(f)
        for i, text in enumerate(texts):
            # Limit the number of documents to prevent hitting rate limits during synthetic generation
            if i > 50: # Reduced to 50 for speed and cost
                break
            documents.append(Document(page_content=text, metadata={"source": f"chunk_{i}", "filename": f"medical_doc_{i}"}))
    return documents

def generate_testset():
    print("Loading documents...")
    documents = load_corpus()
    
    if not documents:
        print("No documents found in data/corpus.json")
        return

    print(f"Loaded {len(documents)} document chunks for generation.")
    
    # We use OpenAI models to generate the test set
    if not os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY").startswith("sk-..."):
        print("Error: OPENAI_API_KEY is not set correctly in the environment.")
        print("Please add it to your .env file.")
        return

    print("Initializing Ragas TestsetGenerator...")
    # Add max_retries and timeout to handle intermittent connection drops
    generator_llm = ChatOpenAI(model="gpt-4o-mini", max_retries=5, timeout=60)
    critic_llm = ChatOpenAI(model="gpt-4o-mini", max_retries=5, timeout=60) # use mini to save cost
    embeddings = OpenAIEmbeddings(max_retries=5, timeout=60)

    generator = TestsetGenerator.from_langchain(
        generator_llm,
        embeddings,
    )

    # Generate test set
    test_size = 5 # Reduced to 5 to avoid long waiting times
    print(f"Generating {test_size} test cases... This might take a few minutes depending on OpenAI API rates.")
    
    # Notice we use generate_with_langchain_docs for LangChain Documents
    # We set raise_exceptions=True so we can see the exact error if it fails
    testset = generator.generate_with_langchain_docs(documents, testset_size=test_size, raise_exceptions=True, with_debugging_logs=True)
    
    test_df = testset.to_pandas()
    
    output_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "rag_testset.csv")
    test_df.to_csv(output_path, index=False)
    print(f"Test set successfully generated and saved to {output_path}")

if __name__ == "__main__":
    generate_testset()
