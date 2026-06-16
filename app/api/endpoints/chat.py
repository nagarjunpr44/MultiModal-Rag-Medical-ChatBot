from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.models.chat import ChatRequest, ChatResponse
from app.services.rag_service import rag_service
from app.data.database import get_db

router = APIRouter()

@router.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """
    Receives a medical query, passes it to the LangChain RAG service,
    and returns the grounded answer.
    """
    try:
        # The rag_service handles the vector db query and the LLM generation.
        # This is asynchronous I/O if we were using a cloud DB, but even with local Chroma,
        # FastAPI handles the routing efficiently.
        answer = rag_service.get_answer(question=request.query)
        
        return ChatResponse(response=answer)
    except Exception as e:
        # Centralized error handling
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat/stream")
async def chat_stream_endpoint(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Receives a medical query, passes it to the LangChain RAG service,
    and returns a Server-Sent Events (SSE) stream of the answer.
    """
    try:
        return StreamingResponse(
            rag_service.get_answer_stream(question=request.query, session_id=request.session_id, db=db),
            media_type="text/event-stream"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
