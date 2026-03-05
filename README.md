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
Execute SELECT queries with optional prepared statement parameters.

```typescript
{
  sql: "SELECT * FROM users WHERE id = ?",
  params: [1]
}
```

### execute
Execute INSERT, UPDATE, or DELETE queries with optional prepared statement parameters.

```typescript
{
  sql: "INSERT INTO users (name, email) VALUES (?, ?)",
  params: ["John Doe", "john@example.com"]
}
```

### list_tables
List all tables in the connected database.

### describe_table
Get the structure of a specific table.

```typescript
{
  table: "users"
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
