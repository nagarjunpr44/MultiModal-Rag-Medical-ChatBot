from fastapi import APIRouter, HTTPException
from app.models.chat import ChatRequest, ChatResponse
from app.services.rag_service import rag_service

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
