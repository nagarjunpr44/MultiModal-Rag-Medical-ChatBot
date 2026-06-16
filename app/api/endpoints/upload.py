from fastapi import APIRouter, UploadFile, File, HTTPException
import shutil
import os
from app.services.document_processor import document_processor

router = APIRouter()

@router.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    """
    Accepts a medical PDF file, saves it temporarily, and processes it into the Vector DB.
    """
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are currently supported.")
    
    # Create a temporary path to save the file
    temp_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "raw")
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, file.filename)
    
    try:
        # Save the uploaded file to disk
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Process the file into ChromaDB
        document_processor.process_pdf(temp_file_path)
        
        return {"status": "success", "message": f"Successfully processed and ingested {file.filename}"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
