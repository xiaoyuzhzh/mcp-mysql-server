# @xiaoyuzhzh/mcp-mysql-server

A Model Context Protocol server that provides MySQL database operations. This server enables AI models to interact with MySQL databases through a standardized interface.

## Installation

```bash
npx -y @xiaoyuzhzh/mcp-mysql-server
```

## Configuration

The server supports two configuration methods (by priority):

### 1. Connection URL (recommended)

```json
{
  "mcpServers": {
    "mysql": {
      "command": "npx",
      "args": ["-y", "@xiaoyuzhzh/mcp-mysql-server", "mysql://user:password@localhost:3306/database"]
    }
  }
}
```

URL supports encoded credentials, e.g. passwords with special characters.

### 2. Environment Variables

```json
{
  "mcpServers": {
    "mysql": {
      "command": "npx",
      "args": ["-y", "@xiaoyuzhzh/mcp-mysql-server"],
      "env": {
        "MYSQL_HOST": "your_host",
        "MYSQL_USER": "your_user",
        "MYSQL_PASSWORD": "your_password",
        "MYSQL_DATABASE": "your_database",
        "MYSQL_PORT": "3306"
      }
    }
  }
}
```

## Available Tools

### connect_db
Switch to a different database connection. Only use when you need to change databases — the connection is established automatically at startup.

### query
Execute read-only SQL queries. Supports SELECT, SHOW, DESCRIBE, DESC, EXPLAIN and other read-only statements.

```json5
{
  sql: "SELECT * FROM users WHERE id = ?",
  params: [1]
}
```

### execute
Execute write SQL queries that modify data or schema. Supports INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE, RENAME, REPLACE statements.

```json5
{
  sql: "INSERT INTO users (name, email) VALUES (?, ?)",
  params: ["John Doe", "john@example.com"]
}
```

## Features

- Automatic connection at startup, no need to call connect_db first
- Secure connection handling with automatic cleanup
- Prepared statement support to prevent SQL injection
- URL-encoded credentials support
- Comprehensive error handling and validation

## Running Evals

```bash
OPENAI_API_KEY=your-key npx mcp-eval src/evals/evals.ts src/index.ts
```

## License

MIT
