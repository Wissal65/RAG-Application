from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import User, ChatHistory, Document, Note
from ..schemas import ChatQuery, ChatResponse, ChatHistoryResponse
from ..auth import get_current_user
from ..rag_pipeline import rag_pipeline

router = APIRouter(prefix="/chat", tags=["Chat"])

@router.post("/query", response_model=ChatResponse)
async def query_documents(
    query_data: ChatQuery,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Query documents using RAG - optimized async version"""
    # Validate that all document IDs belong to the user
    user_documents = db.query(Document.id).filter(
        Document.user_id == current_user.id,
        Document.id.in_(query_data.document_ids)
    ).all()
    
    valid_doc_ids = [doc.id for doc in user_documents]
    
    if not valid_doc_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid documents selected or documents don't belong to you"
        )
    
    # Query using RAG pipeline (async version for better performance)
    result = await rag_pipeline.query_documents_async(
        user_id=current_user.id,
        question=query_data.question,
        document_ids=valid_doc_ids
    )
    
    # Save to chat history
    chat_entry = ChatHistory(
        user_id=current_user.id,
        question=query_data.question,
        answer=result["answer"],
        document_ids=valid_doc_ids
    )
    
    db.add(chat_entry)
    db.commit()
    db.refresh(chat_entry)
    
    return {
        "answer": result["answer"],
        "sources": result["sources"],
        "chat_id": chat_entry.id
    }

@router.post("/query/{chat_id}/save-to-notes")
async def save_chat_to_notes(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save a chat Q&A to notes"""
    chat_entry = db.query(ChatHistory).filter(
        ChatHistory.id == chat_id,
        ChatHistory.user_id == current_user.id
    ).first()
    
    if not chat_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat entry not found"
        )
    
    # Create note from chat
    note_content = f"💬 Q: {chat_entry.question}\n\n🤖 A: {chat_entry.answer}"
    
    new_note = Note(
        user_id=current_user.id,
        content=note_content,
        note_type="from_chat"
    )
    
    db.add(new_note)
    db.commit()
    db.refresh(new_note)
    
    return {
        "message": "Chat saved to notes successfully",
        "note_id": new_note.id
    }

@router.get("/history", response_model=List[ChatHistoryResponse])
async def get_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    limit: int = 50
):
    """Get chat history for current user"""
    history = db.query(ChatHistory).filter(
        ChatHistory.user_id == current_user.id
    ).order_by(ChatHistory.created_at.desc()).limit(limit).all()
    
    return history

@router.delete("/history/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_entry(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a chat history entry"""
    chat_entry = db.query(ChatHistory).filter(
        ChatHistory.id == chat_id,
        ChatHistory.user_id == current_user.id
    ).first()
    
    if not chat_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chat entry not found"
        )
    
    db.delete(chat_entry)
    db.commit()
    
    return None

@router.delete("/history", status_code=status.HTTP_204_NO_CONTENT)
async def clear_chat_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Clear all chat history for current user"""
    db.query(ChatHistory).filter(
        ChatHistory.user_id == current_user.id
    ).delete()
    
    db.commit()
    
    return None