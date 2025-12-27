import React, { useState, useEffect, useRef } from 'react';
import { FileText, Upload, MessageSquare, BookOpen, LogOut, Plus, Trash2, Send, BookmarkPlus, Loader2 } from 'lucide-react';
import { API_BASE } from './config.js';

const api = {
  get: async (url, config = {}) => {
    const res = await fetch(API_BASE + url, {
      ...config,
      headers: { ...config.headers, Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) throw new Error(await res.text());
    return { data: await res.json() };
  },
  post: async (url, data, config = {}) => {
    const isFormData = data instanceof FormData;
    const res = await fetch(API_BASE + url, {
      method: 'POST',
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...config.headers,
        Authorization: `Bearer ${localStorage.getItem('token')}`
      },
      body: isFormData ? data : JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return { data: await res.json() };
  },
  delete: async (url, config = {}) => {
    const res = await fetch(API_BASE + url, {
      method: 'DELETE',
      headers: { ...config.headers, Authorization: `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) throw new Error(await res.text());
    return { data: null };
  }
};

function AuthForm({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) return;
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const res = await fetch(API_BASE + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) throw new Error('Authentication failed');
      
      const data = await res.json();
      localStorage.setItem('token', data.access_token);
      onLogin(data.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="bg-white p-8 rounded-lg shadow-xl w-96">
        <h1 className="text-3xl font-bold text-center mb-6 text-indigo-600">
          RAG Application
        </h1>
        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : isLogin ? 'Login' : 'Register'}
          </button>
        </div>
        <p className="text-center mt-4 text-sm text-gray-600">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-indigo-600 hover:underline"
          >
            {isLogin ? 'Register' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
}

function DocumentsPanel({ documents, onRefresh, selectedDocs, onToggleDoc }) {
  const [uploading, setUploading] = useState(false);
  const [addingText, setAddingText] = useState(false);
  const [textName, setTextName] = useState('');
  const [textContent, setTextContent] = useState('');

  const handleUploadPDF = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.post('/documents/upload-pdf', formData);
      onRefresh();
      e.target.value = '';
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAddText = async () => {
    if (!textName || !textContent) return;
    
    const formData = new FormData();
    formData.append('filename', textName);
    formData.append('content', textContent);

    try {
      await api.post('/documents/add-text', formData);
      setTextName('');
      setTextContent('');
      setAddingText(false);
      onRefresh();
    } catch (err) {
      alert('Failed to add text: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await api.delete(`/documents/${id}`);
      onRefresh();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold mb-4">Documents</h2>
        <div className="space-y-2">
          <label className="block">
            <div className="flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg cursor-pointer hover:bg-indigo-700">
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload PDF'}
            </div>
            <input
              type="file"
              accept=".pdf"
              onChange={handleUploadPDF}
              className="hidden"
              disabled={uploading}
            />
          </label>
          <button
            onClick={() => setAddingText(!addingText)}
            className="w-full flex items-center justify-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Text
          </button>
        </div>
      </div>

      {addingText && (
        <div className="p-4 border-b bg-gray-50 space-y-2">
          <input
            type="text"
            placeholder="Document name"
            value={textName}
            onChange={(e) => setTextName(e.target.value)}
            className="w-full px-3 py-2 border rounded"
          />
          <textarea
            placeholder="Content"
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            className="w-full px-3 py-2 border rounded h-24"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddText}
              className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700"
            >
              Save
            </button>
            <button
              onClick={() => setAddingText(false)}
              className="flex-1 bg-gray-300 py-2 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={`p-3 border rounded-lg cursor-pointer transition ${
              selectedDocs.includes(doc.id) ? 'bg-indigo-50 border-indigo-500' : 'hover:bg-gray-50'
            }`}
            onClick={() => onToggleDoc(doc.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2 flex-1">
                <input
                  type="checkbox"
                  checked={selectedDocs.includes(doc.id)}
                  onChange={() => onToggleDoc(doc.id)}
                  className="mt-1"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <p className="font-medium text-sm truncate">{doc.filename}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {doc.content_type} • {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(doc.id);
                }}
                className="text-red-500 hover:text-red-700 ml-2 flex-shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {documents.length === 0 && (
          <p className="text-gray-500 text-center py-8">No documents yet</p>
        )}
      </div>
    </div>
  );
}

function ChatPanel({ selectedDocs, onNotesUpdate }) {
  const [messages, setMessages] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    loadChatHistory();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChatHistory = async () => {
    try {
      const res = await api.get('/chat/history');
      setChatHistory(res.data);
      
      // Convert history to messages format for display
      const msgs = res.data.flatMap(chat => [
        { role: 'user', content: chat.question, id: chat.id },
        { role: 'assistant', content: chat.answer, sources: chat.sources, id: chat.id }
      ]);
      setMessages(msgs);
    } catch (err) {
      console.error('Failed to load chat history:', err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || selectedDocs.length === 0) {
      alert('Please enter a question and select at least one document');
      return;
    }

    const userMsg = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/chat/query', {
        question: currentInput,
        document_ids: selectedDocs
      });
      
      const assistantMsg = {
        role: 'assistant',
        content: res.data.answer,
        sources: res.data.sources,
        id: res.data.chat_id
      };
      setMessages((prev) => [...prev, assistantMsg]);
      
      // Reload chat history to keep in sync
      loadChatHistory();
    } catch (err) {
      alert('Query failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveToNotes = async (chatId) => {
    try {
      await api.post(`/chat/query/${chatId}/save-to-notes`, {});
      alert('💾 Saved to notes!');
      onNotesUpdate(); // Refresh notes panel
    } catch (err) {
      alert('Failed to save to notes: ' + err.message);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold">Chat</h2>
        <p className="text-sm text-gray-600 mt-1">
          {selectedDocs.length} document(s) selected
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-300 text-xs">
                  <p className="font-semibold">Sources:</p>
                  {msg.sources.map((source, i) => (
                    <p key={i}>• {source}</p>
                  ))}
                </div>
              )}
              {msg.role === 'assistant' && msg.id && (
                <div className="mt-2 pt-2 border-t border-gray-300">
                  <button
                    onClick={() => saveToNotes(msg.id)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                  >
                    <BookmarkPlus size={14} />
                    Save to Notes
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <p className="text-gray-600">Thinking...</p>
            </div>
          </div>
        )}
        {messages.length === 0 && !loading && (
          <div className="text-center text-gray-500 py-12">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Select documents and ask a question to get started</p>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !loading && selectedDocs.length > 0 && handleSend()}
            placeholder="Ask a question..."
            className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            disabled={loading || selectedDocs.length === 0}
          />
          <button
            onClick={handleSend}
            disabled={loading || selectedDocs.length === 0}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotesPanel() {
  const [notes, setNotes] = useState([]);
  const [adding, setAdding] = useState(false);
  const [content, setContent] = useState('');

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const res = await api.get('/notes/list');
      setNotes(res.data);
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  };

  const handleAdd = async () => {
    if (!content.trim()) return;
    
    try {
      await api.post('/notes/create', { content, note_type: 'manual' });
      setContent('');
      setAdding(false);
      loadNotes();
    } catch (err) {
      alert('Failed to create note: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      await api.delete(`/notes/${id}`);
      loadNotes();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  const getNoteIcon = (type) => {
    if (type === 'ai_generated') return '🤖';
    if (type === 'from_chat') return '💬';
    return '📝';
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold mb-4">Notes</h2>
        <button
          onClick={() => setAdding(!adding)}
          className="w-full flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Note
        </button>
      </div>

      {adding && (
        <div className="p-4 border-b bg-gray-50 space-y-2">
          <textarea
            placeholder="Write your note..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full px-3 py-2 border rounded h-32"
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              className="flex-1 bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700"
            >
              Save
            </button>
            <button
              onClick={() => setAdding(false)}
              className="flex-1 bg-gray-300 py-2 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {notes.map((note) => (
          <div key={note.id} className="p-3 border rounded-lg bg-yellow-50">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs px-2 py-1 bg-yellow-200 rounded flex items-center gap-1">
                {getNoteIcon(note.note_type)} {note.note_type}
              </span>
              <button
                onClick={() => handleDelete(note.id)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
            <p className="text-xs text-gray-500 mt-2">
              {new Date(note.created_at).toLocaleString()}
            </p>
          </div>
        ))}
        {notes.length === 0 && (
          <p className="text-gray-500 text-center py-8">No notes yet</p>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [activeTab, setActiveTab] = useState('chat');
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [notesKey, setNotesKey] = useState(0);

  useEffect(() => {
    if (token) loadDocuments();
  }, [token]);

  const loadDocuments = async () => {
    try {
      const res = await api.get('/documents/list');
      setDocuments(res.data);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  const toggleDoc = (id) => {
    setSelectedDocs((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const refreshNotes = () => {
    setNotesKey(prev => prev + 1);
  };

  if (!token) return <AuthForm onLogin={setToken} />;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-indigo-600">RAG Application</h1>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 bg-white border-r">
          <DocumentsPanel
            documents={documents}
            onRefresh={loadDocuments}
            selectedDocs={selectedDocs}
            onToggleDoc={toggleDoc}
          />
        </div>

        <div className="flex-1 flex flex-col">
          <div className="border-b bg-white">
            <div className="flex">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 ${
                  activeTab === 'chat'
                    ? 'border-b-2 border-indigo-600 text-indigo-600'
                    : 'text-gray-600'
                }`}
              >
                <MessageSquare className="w-5 h-5" />
                Chat
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 ${
                  activeTab === 'notes'
                    ? 'border-b-2 border-indigo-600 text-indigo-600'
                    : 'text-gray-600'
                }`}
              >
                <BookOpen className="w-5 h-5" />
                Notes
              </button>
            </div>
          </div>

          <div className="flex-1 bg-white overflow-hidden">
            {activeTab === 'chat' ? (
              <ChatPanel selectedDocs={selectedDocs} onNotesUpdate={refreshNotes} />
            ) : (
              <NotesPanel key={notesKey} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}