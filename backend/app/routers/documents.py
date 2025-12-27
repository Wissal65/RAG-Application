from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List
import os
import shutil
from ..database import get_db
from ..models import User, Document, Note
from ..schemas import DocumentResponse, DocumentCreate
from ..auth import get_current_user
from ..rag_pipeline import rag_pipeline

router = APIRouter(prefix="/documents", tags=["Documents"])

UPLOAD_DIR = "./uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload-pdf", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_pdf(
    file: UploadFile = File(...),
    auto_summary: bool = Form(default=True),  # Enable auto-summary by default
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload and process a PDF document with optional auto-summary"""
    # Validate file type
    if not file.filename.endswith('.pdf'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are allowed"
        )
    
    # Create user directory
    user_dir = os.path.join(UPLOAD_DIR, str(current_user.id))
    os.makedirs(user_dir, exist_ok=True)
    
    # Save file
    file_path = os.path.join(user_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Create document record
    new_document = Document(
        user_id=current_user.id,
        filename=file.filename,
        content_type="pdf",
        file_path=file_path
    )
    
    db.add(new_document)
    db.commit()
    db.refresh(new_document)
    
    # Extract text and process with RAG pipeline
    try:
        text = rag_pipeline.extract_text_from_pdf(file_path)
        result = rag_pipeline.process_and_store_document(
            user_id=current_user.id,
            document_id=new_document.id,
            text=text,
            filename=file.filename,
            generate_summary=auto_summary
        )
        
        print(f"Processed {result['chunk_count']} chunks for document {new_document.id}")
        
        # If summary was generated, we save it as a note
        if auto_summary and "summary" in result:
            summary_note = Note(
                user_id=current_user.id,
                content=f"📄 Summary of '{file.filename}':\n\n{result['summary']}",
                note_type="ai_generated"
            )
            db.add(summary_note)
            db.commit()
            print(f"Auto-generated summary saved as note")
            
    except Exception as e:
        # Rollback document creation if RAG processing fails
        db.delete(new_document)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing PDF: {str(e)}"
        )
    
    return new_document

@router.post("/add-text", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def add_text_document(
    filename: str = Form(...),
    content: str = Form(...),
    auto_summary: bool = Form(default=True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a text document or note with optional auto-summary"""
    # Create document record
    new_document = Document(
        user_id=current_user.id,
        filename=filename,
        content_type="text",
        text_content=content
    )
    
    db.add(new_document)
    db.commit()
    db.refresh(new_document)
    
    # Process with RAG pipeline
    try:
        result = rag_pipeline.process_and_store_document(
            user_id=current_user.id,
            document_id=new_document.id,
            text=content,
            filename=filename,
            generate_summary=auto_summary
        )
        
        print(f"Processed {result['chunk_count']} chunks for text document {new_document.id}")
        
        # If summary was generated, we save it as a note
        if auto_summary and "summary" in result:
            summary_note = Note(
                user_id=current_user.id,
                content=f"📝 Summary of '{filename}':\n\n{result['summary']}",
                note_type="ai_generated"
            )
            db.add(summary_note)
            db.commit()
            print(f"Auto-generated summary saved as note")
            
    except Exception as e:
        db.delete(new_document)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error processing text: {str(e)}"
        )
    
    return new_document

@router.post("/{document_id}/summarize")
async def generate_document_summary(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually generate a summary for an existing document"""
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == current_user.id
    ).first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # Get document text
    if document.content_type == "pdf":
        text = rag_pipeline.extract_text_from_pdf(document.file_path)
    else:
        text = document.text_content
    
    # Generate summary
    try:
        summary = rag_pipeline.generate_summary(text)
        
        # Save as note
        summary_note = Note(
            user_id=current_user.id,
            content=f"📄 Summary of '{document.filename}':\n\n{summary}",
            note_type="ai_generated"
        )
        db.add(summary_note)
        db.commit()
        
        return {
            "message": "Summary generated successfully",
            "summary": summary
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating summary: {str(e)}"
        )

@router.get("/list", response_model=List[DocumentResponse])
async def list_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all documents for current user"""
    documents = db.query(Document).filter(Document.user_id == current_user.id).order_by(Document.created_at.desc()).all()
    return documents

@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a document"""
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == current_user.id
    ).first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # Delete file if it exists
    if document.file_path and os.path.exists(document.file_path):
        os.remove(document.file_path)
    
    # Delete embeddings from ChromaDB
    rag_pipeline.delete_document_embeddings(current_user.id, document_id)
    
    # Delete from database
    db.delete(document)
    db.commit()
    
    return None