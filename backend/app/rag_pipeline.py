import chromadb
from chromadb.config import Settings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.llms import Ollama
from langchain.chains import RetrievalQA
from langchain_community.vectorstores import Chroma
from langchain.schema import Document
from pypdf import PdfReader
from typing import List, Dict
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor

class RAGPipeline:
    def __init__(self):
        # Initialize ChromaDB client
        self.chroma_client = chromadb.PersistentClient(
            path="./chroma_db",
            settings=Settings(anonymized_telemetry=False)
        )
        
        # Initialize embeddings 
        self.embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2"
        )
        
        # Initialize text splitter
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len
        )
        
        # Initialize LLM with optimized settings
        self.llm = Ollama(
            model="llama3.2",
            temperature=0.7,
            num_ctx=2048,  
            num_predict=512  
        )
        
        # Thread pool for blocking operations
        self.executor = ThreadPoolExecutor(max_workers=3)
    
    def get_collection_name(self, user_id: int) -> str:
        """Generate unique collection name for user"""
        return f"user_{user_id}_documents"
    
    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Extract text from PDF file"""
        reader = PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text
    
    async def generate_summary_async(self, text: str, max_length: int = 500) -> str:
        """
        Generate a summary asynchronously
        """
        max_chars = 10000
        if len(text) > max_chars:
            text = text[:max_chars] + "..."
        
        prompt = f"""Please provide a concise summary of the following document. 
Include the main topics, key points, and important information.
Keep the summary under {max_length} words.

Document:
{text}

Summary:"""
        
        try:
            # Run blocking LLM call in thread pool
            loop = asyncio.get_event_loop()
            summary = await loop.run_in_executor(
                self.executor,
                lambda: self.llm(prompt)
            )
            return summary.strip()
        except Exception as e:
            return f"Failed to generate summary: {str(e)}"
    
    def generate_summary(self, text: str, max_length: int = 500) -> str:
        """Synchronous version for compatibility"""
        max_chars = 10000
        if len(text) > max_chars:
            text = text[:max_chars] + "..."
        
        prompt = f"""Please provide a concise summary of the following document. 
Include the main topics, key points, and important information.
Keep the summary under {max_length} words.

Document:
{text}

Summary:"""
        
        try:
            summary = self.llm(prompt)
            return summary.strip()
        except Exception as e:
            return f"Failed to generate summary: {str(e)}"
    
    def process_and_store_document(
        self,
        user_id: int,
        document_id: int,
        text: str,
        filename: str,
        generate_summary: bool = False
    ) -> Dict:
        """Process document and store embeddings"""
        chunks = self.text_splitter.split_text(text)
        
        documents = [
            Document(
                page_content=chunk,
                metadata={
                    "document_id": document_id,
                    "filename": filename,
                    "chunk_index": i
                }
            )
            for i, chunk in enumerate(chunks)
        ]
        
        collection_name = self.get_collection_name(user_id)
        
        vectorstore = Chroma(
            client=self.chroma_client,
            collection_name=collection_name,
            embedding_function=self.embeddings
        )
        
        ids = [f"doc_{document_id}_chunk_{i}" for i in range(len(documents))]
        vectorstore.add_documents(documents=documents, ids=ids)
        
        result = {"chunk_count": len(chunks)}
        
        if generate_summary:
            summary = self.generate_summary(text)
            result["summary"] = summary
        
        return result
    
    def delete_document_embeddings(self, user_id: int, document_id: int):
        """Delete all embeddings for a specific document"""
        collection_name = self.get_collection_name(user_id)
        
        try:
            collection = self.chroma_client.get_collection(collection_name)
            results = collection.get(
                where={"document_id": document_id}
            )
            if results and results['ids']:
                collection.delete(ids=results['ids'])
        except Exception as e:
            print(f"Error deleting embeddings: {e}")
    
    async def query_documents_async(
        self,
        user_id: int,
        question: str,
        document_ids: List[int],
        k: int = 3 
    ) -> Dict:
        """Query documents using RAG - async version"""
        collection_name = self.get_collection_name(user_id)
        
        try:
            vectorstore = Chroma(
                client=self.chroma_client,
                collection_name=collection_name,
                embedding_function=self.embeddings
            )
            
            retriever = vectorstore.as_retriever(
                search_kwargs={
                    "k": k,
                    "filter": {"document_id": {"$in": document_ids}}
                }
            )
            
            qa_chain = RetrievalQA.from_chain_type(
                llm=self.llm,
                chain_type="stuff",
                retriever=retriever,
                return_source_documents=True
            )
            
            # Run query in thread pool
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                self.executor,
                lambda: qa_chain({"query": question})
            )
            
            sources = []
            for doc in result.get("source_documents", []):
                source_info = f"{doc.metadata.get('filename', 'Unknown')} (chunk {doc.metadata.get('chunk_index', 0)})"
                if source_info not in sources:
                    sources.append(source_info)
            
            return {
                "answer": result["result"],
                "sources": sources
            }
            
        except Exception as e:
            return {
                "answer": f"Error processing query: {str(e)}",
                "sources": []
            }
    
    def query_documents(
        self,
        user_id: int,
        question: str,
        document_ids: List[int],
        k: int = 3
    ) -> Dict:
        """Synchronous wrapper for compatibility"""
        collection_name = self.get_collection_name(user_id)
        
        try:
            vectorstore = Chroma(
                client=self.chroma_client,
                collection_name=collection_name,
                embedding_function=self.embeddings
            )
            
            retriever = vectorstore.as_retriever(
                search_kwargs={
                    "k": k,
                    "filter": {"document_id": {"$in": document_ids}}
                }
            )
            
            qa_chain = RetrievalQA.from_chain_type(
                llm=self.llm,
                chain_type="stuff",
                retriever=retriever,
                return_source_documents=True
            )
            
            result = qa_chain({"query": question})
            
            sources = []
            for doc in result.get("source_documents", []):
                source_info = f"{doc.metadata.get('filename', 'Unknown')} (chunk {doc.metadata.get('chunk_index', 0)})"
                if source_info not in sources:
                    sources.append(source_info)
            
            return {
                "answer": result["result"],
                "sources": sources
            }
            
        except Exception as e:
            return {
                "answer": f"Error processing query: {str(e)}",
                "sources": []
            }

# Global instance
rag_pipeline = RAGPipeline()