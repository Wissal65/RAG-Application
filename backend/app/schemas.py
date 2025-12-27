from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# User Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

# Document Schemas
class DocumentCreate(BaseModel):
    filename: str
    content_type: str
    text_content: Optional[str] = None

class DocumentResponse(BaseModel):
    id: int
    filename: str
    content_type: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# Note Schemas
class NoteCreate(BaseModel):
    content: str
    note_type: str = "manual"

class NoteResponse(BaseModel):
    id: int
    content: str
    note_type: str
    created_at: datetime
    
    class Config:
        from_attributes = True

# Chat Schemas
class ChatQuery(BaseModel):
    question: str
    document_ids: List[int]

class ChatResponse(BaseModel):
    answer: str
    sources: List[str]
    chat_id: int

class ChatHistoryResponse(BaseModel):
    id: int
    question: str
    answer: str
    document_ids: List[int]
    created_at: datetime
    
    class Config:
        from_attributes = True