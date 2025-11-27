# AI Knowledge Assistant - TODO

## Core Infrastructure
- [ ] Настройка Docker-окружения для локального развертывания
- [ ] Интеграция локальной LLM модели (Ollama + Mistral/LLaMA)
- [ ] Настройка векторной БД для хранения эмбеддингов (Weaviate/Milvus/Chroma)
- [ ] Создание модуля обработки документов (PDF, XLS, XLSX, DOC, DOCX парсинг)

## Database Schema
- [ ] Таблица documents (id, filename, file_type, upload_date, status)
- [ ] Таблица document_chunks (id, document_id, content, embedding, chunk_index)
- [ ] Таблица prompts (id, system_prompt, created_at, updated_at)
- [ ] Таблица assistant_stats (id, query_count, avg_response_time, source)
- [ ] Таблица chat_history (id, user_id, query, response, source, timestamp)

## Backend API (tRPC Procedures)
- [ ] Document Management
  - [ ] uploadDocument (file upload, parsing, indexing)
  - [ ] deleteDocument (remove from DB and vector DB)
  - [ ] listDocuments (paginated list with metadata)
  - [ ] getDocumentStats (usage statistics per document)
- [ ] RAG & Assistant
  - [ ] askAssistant (query with context retrieval)
  - [ ] updateSystemPrompt (edit main prompt)
  - [ ] getSystemPrompt (retrieve current prompt)
- [ ] Statistics
  - [ ] getAssistantStats (total queries, avg response time)
  - [ ] getChatHistory (paginated chat history)
  - [ ] getQueryTrends (queries over time)
- [ ] Integration
  - [ ] handleBitrix24Webhook (receive and process Bitrix24 messages)
  - [ ] getWebChatConfig (return chat widget configuration)

## Frontend Pages
- [ ] Admin Dashboard (main layout with sidebar)
- [ ] Documents Management Page
  - [ ] Document upload form (drag-and-drop)
  - [ ] Documents table (list, delete, view stats)
  - [ ] Upload progress indicator
- [ ] Prompt Editor Page
  - [ ] Text editor for system prompt
  - [ ] Save/cancel buttons
  - [ ] Preview of current prompt
- [ ] Test Panel Page
  - [ ] Chat interface for testing assistant
  - [ ] Real-time response display
  - [ ] Show retrieved context/sources
- [ ] Statistics Dashboard
  - [ ] Total queries count
  - [ ] Average response time
  - [ ] Queries by source (website, Bitrix24)
  - [ ] Popular questions
  - [ ] Query trends chart

## Web Chat Widget
- [ ] Embedded chat widget component
- [ ] Chat message interface
- [ ] Real-time message streaming
- [ ] Widget initialization script

## Bitrix24 Integration
- [ ] Webhook endpoint for receiving messages
- [ ] Message parsing and forwarding to RAG
- [ ] Response formatting for Bitrix24
- [ ] Error handling and retry logic

## Deployment & Documentation
- [ ] Dockerfile configuration
- [ ] docker-compose.yml with all services
- [ ] Environment variables documentation
- [ ] Installation and setup guide
- [ ] API documentation

## Testing & Optimization
- [ ] Load testing (multiple concurrent requests)
- [ ] Document processing performance optimization
- [ ] Vector search optimization
- [ ] Response caching strategy


## Completed Tasks

- [x] Настройка Docker-окружения для локального развертывания
- [x] Интеграция локальной LLM модели (Ollama + Mistral/LLaMA)
- [x] Настройка векторной БД для хранения эмбеддингов (Weaviate/Milvus/Chroma)
- [x] Создание модуля обработки документов (PDF, XLS, XLSX, DOC, DOCX парсинг)

## Database Schema
- [x] Таблица documents (id, filename, file_type, upload_date, status)
- [x] Таблица document_chunks (id, document_id, content, embedding, chunk_index)
- [x] Таблица prompts (id, system_prompt, created_at, updated_at)
- [x] Таблица assistant_stats (id, query_count, avg_response_time, source)
- [x] Таблица chat_history (id, user_id, query, response, source, timestamp)

## Backend API (tRPC Procedures)
- [x] Document Management
  - [x] uploadDocument (file upload, parsing, indexing)
  - [x] deleteDocument (remove from DB and vector DB)
  - [x] listDocuments (paginated list with metadata)
  - [x] getDocumentStats (usage statistics per document)
- [x] RAG & Assistant
  - [x] askAssistant (query with context retrieval)
  - [x] updateSystemPrompt (edit main prompt)
  - [x] getSystemPrompt (retrieve current prompt)
- [x] Statistics
  - [x] getAssistantStats (total queries, avg response time)
  - [x] getChatHistory (paginated chat history)
  - [x] getQueryTrends (queries over time)
- [x] Integration
  - [x] handleBitrix24Webhook (receive and process Bitrix24 messages)
  - [x] getWebChatConfig (return chat widget configuration)

## Frontend Pages
- [x] Admin Dashboard (main layout with sidebar)
- [x] Documents Management Page
  - [x] Document upload form (drag-and-drop)
  - [x] Documents table (list, delete, view stats)
  - [x] Upload progress indicator
- [x] Prompt Editor Page
  - [x] Text editor for system prompt
  - [x] Save/cancel buttons
  - [x] Preview of current prompt
- [x] Test Panel Page
  - [x] Chat interface for testing assistant
  - [x] Real-time response display
  - [x] Show retrieved context/sources
- [x] Statistics Dashboard
  - [x] Total queries count
  - [x] Average response time
  - [x] Queries by source (website, Bitrix24)
  - [x] Popular questions
  - [x] Query trends chart

## Web Chat Widget
- [x] Embedded chat widget component
- [x] Chat message interface
- [x] Real-time message streaming
- [x] Widget initialization script

## Bitrix24 Integration
- [x] Webhook endpoint for receiving messages
- [x] Message parsing and forwarding to RAG
- [x] Response formatting for Bitrix24
- [x] Error handling and retry logic

## Deployment & Documentation
- [x] Dockerfile configuration
- [x] docker-compose.yml with all services
- [x] Environment variables documentation
- [x] Installation and setup guide
- [x] API documentation

## Remaining Tasks (For Future Implementation)

- [ ] File upload implementation (S3 integration)
- [ ] Document processing job queue (Bull/BullMQ)
- [ ] Advanced vector search optimization
- [ ] User authentication and role management
- [ ] Rate limiting and API throttling
- [ ] Caching layer (Redis)
- [ ] Logging and monitoring (ELK stack)
- [ ] Unit and integration tests
- [ ] CI/CD pipeline setup
- [ ] Production deployment scripts

## Bug Fixes
- [x] Исправлена ошибка в Dockerfile при копировании patches директории
- [x] Добавлен .dockerignore для оптимизации образа
