import os
import sys


sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.document_processor import document_processor

def main():
    data_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "raw")
    
    if not os.path.exists(data_dir):
        print(f"Directory {data_dir} does not exist.")
        return

    # Look for any PDF files in the raw data directory
    files = [f for f in os.listdir(data_dir) if f.endswith('.pdf')]
    
    if not files:
        print(f"No PDF files found in {data_dir}. Please add some medical PDFs to ingest.")
        return

    for file in files:
        file_path = os.path.join(data_dir, file)
        try:
            document_processor.process_pdf(file_path)
            print(f"Successfully processed {file}\n")
        except Exception as e:
            print(f"Failed to process {file}: {str(e)}\n")

if __name__ == "__main__":
    main()
