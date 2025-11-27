import mysql from "mysql2/promise";
import crypto from "crypto";

/**
 * Initialize database schema and default admin
 */
export async function initializeDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log("[DB Init] DATABASE_URL not set, skipping initialization");
    return;
  }

  try {
    // Parse connection string
    const match = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
    if (!match) {
      console.error("[DB Init] Invalid DATABASE_URL format");
      return;
    }

    const [, user, password, host, port, databaseWithParams] = match;
    
    // Separate database name from URL parameters
    const database = databaseWithParams.split('?')[0];

    const connection = await mysql.createConnection({
      host,
      port: parseInt(port),
      user,
      password,
      database,
      charset: 'utf8mb4',
    });

    console.log("[DB Init] Connected to database");

    // Create users table if not exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        openId VARCHAR(64) NOT NULL UNIQUE,
        name TEXT,
        email VARCHAR(320) UNIQUE,
        passwordHash VARCHAR(255),
        loginMethod VARCHAR(64),
        role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        lastSignedIn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX email_idx (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log("[DB Init] ✅ Users table ready");

    // Create documents table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        fileType VARCHAR(20) NOT NULL,
        fileSize INT NOT NULL,
        uploadedBy INT NOT NULL,
        uploadedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status ENUM('processing', 'indexed', 'failed') NOT NULL DEFAULT 'processing',
        errorMessage TEXT,
        chunksCount INT NOT NULL DEFAULT 0,
        s3Key VARCHAR(512),
        processingType ENUM('general', 'instruction', 'catalog') NOT NULL DEFAULT 'general',
        docType ENUM('catalog', 'instruction', 'general') NOT NULL DEFAULT 'general',
        title VARCHAR(512),
        year INT,
        pages INT,
        processingStage ENUM('queued','parsing','chunking','embedding','saving','completed','failed') NOT NULL DEFAULT 'queued',
        processingProgress INT NOT NULL DEFAULT 0,
        processingMessage LONGTEXT,
        documentMetadata JSON,
        tocJson JSON,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX uploadedBy_idx (uploadedBy),
        INDEX status_idx (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log("[DB Init] ✅ Documents table ready");

    // Add missing columns to documents table if needed
    try {
      await connection.execute(`
        ALTER TABLE documents 
        ADD COLUMN processingType ENUM('general', 'instruction', 'catalog') NOT NULL DEFAULT 'general' AFTER s3Key
      `);
      console.log("[DB Init] ✅ Added processingType column");
    } catch (e: any) {
      if (e.errno === 1060) { // ER_DUP_FIELDNAME
        console.log("[DB Init] processingType column already exists");
      } else {
        console.warn("[DB Init] Warning adding processingType:", e.message);
      }
    }

    try {
      await connection.execute(`
        ALTER TABLE documents 
        MODIFY COLUMN processingType ENUM('general','instruction','catalog') NOT NULL DEFAULT 'general'
      `);
      console.log("[DB Init] ✅ processingType enum updated");
    } catch (e: any) {
      console.warn("[DB Init] Warning updating processingType enum:", e.message);
    }
    
    try {
      await connection.execute(`
        ALTER TABLE documents 
        ADD COLUMN docType ENUM('catalog','instruction','general') NOT NULL DEFAULT 'general' AFTER processingType
      `);
      console.log("[DB Init] ✅ Added docType column");
    } catch (e: any) {
      if (e.errno === 1060) {
        console.log("[DB Init] docType column already exists");
      } else {
        console.warn("[DB Init] Warning adding docType:", e.message);
      }
    }

    try {
      await connection.execute(`
        ALTER TABLE documents 
        MODIFY COLUMN docType ENUM('catalog','instruction','general') NOT NULL DEFAULT 'general'
      `);
      console.log("[DB Init] ✅ docType enum updated");
    } catch (e: any) {
      console.warn("[DB Init] Warning updating docType enum:", e.message);
    }

    const processingColumns = [
      "title VARCHAR(512)",
      "year INT",
      "pages INT",
      "processingStage ENUM('queued','parsing','chunking','embedding','saving','completed','failed') NOT NULL DEFAULT 'queued'",
      "processingProgress INT NOT NULL DEFAULT 0",
      "processingMessage LONGTEXT",
      "tocJson JSON"
    ];

    for (const column of processingColumns) {
      try {
        await connection.execute(`
          ALTER TABLE documents
          ADD COLUMN ${column}
        `);
        console.log(`[DB Init] ✅ Added column: ${column}`);
      } catch (e: any) {
        if (e.errno === 1060) {
          // Column already exists; ignore
        } else {
          console.warn(`[DB Init] Warning adding column ${column}:`, e.message);
        }
      }
    }
 
    try {
      await connection.execute(`
        ALTER TABLE documents 
        ADD COLUMN documentMetadata JSON AFTER processingMessage
      `);
      console.log("[DB Init] ✅ Added documentMetadata column");
    } catch (e: any) {
      if (e.errno === 1060) { // ER_DUP_FIELDNAME
        console.log("[DB Init] documentMetadata column already exists");
      } else {
        console.warn("[DB Init] Warning adding documentMetadata:", e.message);
      }
    }

    // Create document_chunks table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        documentId INT NOT NULL,
        chunkIndex INT NOT NULL,
        content LONGTEXT NOT NULL,
        embedding LONGTEXT,
        tokenCount INT NOT NULL DEFAULT 0,
        chunkMetadata JSON,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX documentId_idx (documentId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log("[DB Init] ✅ Document chunks table ready");

    // Add missing columns to document_chunks table if needed
    try {
      await connection.execute(`
        ALTER TABLE document_chunks 
        ADD COLUMN chunkMetadata JSON AFTER tokenCount
      `);
      console.log("[DB Init] ✅ Added chunkMetadata column");
    } catch (e: any) {
      if (e.errno === 1060) { // ER_DUP_FIELDNAME
        console.log("[DB Init] chunkMetadata column already exists");
      } else {
        console.warn("[DB Init] Warning adding chunkMetadata:", e.message);
      }
    }

    // Create system_prompts table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS system_prompts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        prompt LONGTEXT NOT NULL,
        version INT NOT NULL DEFAULT 1,
        createdBy INT NOT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        isActive BOOLEAN NOT NULL DEFAULT TRUE,
        INDEX isActive_idx (isActive)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log("[DB Init] ✅ System prompts table ready");

    // Create chat_history table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS chat_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT,
        sessionId VARCHAR(128),
        query LONGTEXT NOT NULL,
        response LONGTEXT NOT NULL,
        source ENUM('website', 'bitrix24', 'test') NOT NULL,
        responseTime INT NOT NULL DEFAULT 0,
        tokensUsed INT NOT NULL DEFAULT 0,
        documentsUsed INT NOT NULL DEFAULT 0,
        rating INT,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX userId_idx (userId),
        INDEX source_idx (source),
        INDEX createdAt_idx (createdAt),
        INDEX sessionId_idx (sessionId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log("[DB Init] ✅ Chat history table ready");

    // Create query_stats table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS query_stats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date VARCHAR(10) NOT NULL,
        totalQueries INT NOT NULL DEFAULT 0,
        avgResponseTime DECIMAL(10,2) NOT NULL DEFAULT 0,
        websiteQueries INT NOT NULL DEFAULT 0,
        bitrix24Queries INT NOT NULL DEFAULT 0,
        avgTokensUsed DECIMAL(10,2) NOT NULL DEFAULT 0,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX date_idx (date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log("[DB Init] ✅ Query stats table ready");

    // Create product_groups table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS product_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        documentId INT NOT NULL,
        name VARCHAR(512) NOT NULL,
        description TEXT,
        sectionPath VARCHAR(512),
        pageStart INT,
        pageEnd INT,
        createdBy INT NOT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX product_groups_document_idx (documentId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[DB Init] ✅ Product groups table ready");

    // Create manual_regions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS manual_regions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        documentId INT NOT NULL,
        pageNumber INT NOT NULL,
        regionType ENUM('text', 'table', 'table_with_articles', 'figure', 'list') NOT NULL,
        coordinates JSON NOT NULL,
        extractedText TEXT,
        isNomenclatureTable BOOLEAN NOT NULL DEFAULT FALSE,
        productGroupId INT,
        notes TEXT,
        createdBy INT NOT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX manual_regions_document_idx (documentId),
        INDEX manual_regions_page_idx (documentId, pageNumber)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[DB Init] ✅ Manual regions table ready");

    // Check if admin exists
    const adminEmail = process.env.ADMIN_EMAIL || "admin@admin.local";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    const adminName = process.env.ADMIN_NAME || "Administrator";

    const [rows] = await connection.execute(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [adminEmail]
    );

    let adminId: number;

    if (Array.isArray(rows) && rows.length === 0) {
      // Create admin
      const openId = `admin-${crypto.randomUUID()}`;
      const passwordHash = crypto.createHash('sha256').update(adminPassword).digest('hex');

      const [result] = await connection.execute(
        `INSERT INTO users (openId, name, email, passwordHash, loginMethod, role, lastSignedIn)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [openId, adminName, adminEmail, passwordHash, "email", "admin"]
      );

      adminId = (result as any).insertId;

      console.log("[DB Init] ✅ Default admin created!");
      console.log(`[DB Init] Email: ${adminEmail}`);
      console.log(`[DB Init] Password: ${adminPassword}`);
    } else {
      adminId = (rows as any)[0].id;
      console.log("[DB Init] Admin already exists");
    }

    // Check if system prompt exists
    const [promptRows] = await connection.execute(
      "SELECT id FROM system_prompts WHERE isActive = TRUE LIMIT 1"
    );

    if (Array.isArray(promptRows) && promptRows.length === 0) {
      // Create default system prompt
      const defaultPrompt = `Вы - профессиональный AI-ассистент базы знаний.

ВАША РОЛЬ:
- Помогаете пользователям находить информацию в загруженных документах
- Отвечаете точно, опираясь только на предоставленный контекст
- Общаетесь профессионально, но дружелюбно

ПРАВИЛА ОТВЕТОВ:
1. Используйте только информацию из предоставленного контекста
2. Если информации нет в контексте - честно скажите об этом
3. Цитируйте конкретные фрагменты из документов, когда это уместно
4. Структурируйте ответы: используйте списки, заголовки, выделения
5. Если вопрос неясен - попросите уточнить

СТИЛЬ ОБЩЕНИЯ:
- Профессиональный, но не формальный
- Краткий, но информативный
- Понятный неспециалистам
- Без ненужных вводных фраз

ОГРАНИЧЕНИЯ:
- Не выдумывайте информацию
- Не давайте медицинские, юридические или финансовые советы
- Не обсуждайте политику или религию
- Не предоставляйте личную информацию о людях`;

      await connection.execute(
        `INSERT INTO system_prompts (prompt, version, createdBy, isActive)
         VALUES (?, ?, ?, TRUE)`,
        [defaultPrompt, 1, adminId]
      );

      console.log("[DB Init] ✅ Default system prompt created!");
    } else {
      console.log("[DB Init] System prompt already exists");
    }

    await connection.end();
  } catch (error) {
    console.error("[DB Init] Error:", error);
  }
}

