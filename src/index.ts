#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as mysql from 'mysql2/promise';
// import { config } from 'dotenv';
import { URL } from 'url';

// // Load environment variables
// config();



interface DatabaseConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port?: number; // Add optional port parameter
}

// Type guard for error objects
function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

// Helper to get error message
function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  return String(error);
}

// Add parseMySQLUrl function after DatabaseConfig interface
function parseMySQLUrl(url: string): DatabaseConfig {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'mysql:') {
      throw new Error('Invalid MySQL URL protocol');
    }

    return {
      host: parsedUrl.hostname,
      user: decodeURIComponent(parsedUrl.username || ''),
      password: decodeURIComponent(parsedUrl.password || ''),
      database: parsedUrl.pathname.slice(1), // remove leading '/'
      port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : 3306,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      throw new Error(`Invalid MySQL URL: ${error.message}`);
    }
    throw new Error('Invalid MySQL URL: Unknown error');
  }
}

class MySQLServer {
  private server: Server;
  private connection: mysql.Connection | null = null;
  private config: DatabaseConfig | null = null;

  constructor() {
    this.server = new Server(
      {
        name: 'mysql-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Get database URL from command line arguments
    const args = process.argv.slice(2);
    if (args.length > 0) {
      try {
        const databaseUrl = args[0];
        this.config = parseMySQLUrl(databaseUrl);

      } catch (error: unknown) {
        console.error('Error parsing database URL:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
      }
    }
    
    if (process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_PASSWORD && process.env.MYSQL_DATABASE) {
      // Fallback to environment variables if no command line argument is provided
      this.config = {
        host: process.env.MYSQL_HOST,
        user: process.env.MYSQL_USER,
        password: process.env.MYSQL_PASSWORD,
        database: process.env.MYSQL_DATABASE,
        port: Number(process.env.MYSQL_PORT ?? 3306),
      };
    }

    if (!this.config) {
      console.error('No database configuration provided. Please provide a MySQL URL as a command line argument');
      console.error('Example: node xxx.js mysql://user:password@localhost:3306/mydb');
      process.exit(1);
    }

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });
  }

  private async cleanup() {
    try {
      if (this.connection) {
        await this.connection.end();
      }
    } catch {
      // connection may already be closed
    }
    await this.server.close();
  }

  private async ensureConnection() {
    if (!this.config) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Database configuration not set. Use connect_db tool first.'
      );
    }

    if (!this.connection) {
      try {
        this.connection = await mysql.createConnection(this.config);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to connect to database: ${getErrorMessage(error)}`
        );
      }
    }
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'connect_db',
          description: 'Switch to a different MySQL database connection. Only use this if you need to connect to a different database than the one configured at startup.',
          inputSchema: {
            type: 'object',
            properties: {
              host: {
                type: 'string',
                description: 'Database host',
              },
              user: {
                type: 'string',
                description: 'Database user',
              },
              password: {
                type: 'string',
                description: 'Database password',
              },
              database: {
                type: 'string',
                description: 'Database name',
              },
              port: {
                type: 'number',
                description: 'Database port (optional)',
              },
            },
            required: ['host', 'user', 'password', 'database'],
          },
        },
        {
          name: 'query',
          description: 'Execute a read-only SQL query. Supports SELECT, SHOW, DESCRIBE, DESC, EXPLAIN and other read-only statements. Use this for any query that does not modify data.',
          inputSchema: {
            type: 'object',
            properties: {
              sql: {
                type: 'string',
                description: 'Read-only SQL query (SELECT, SHOW, DESCRIBE, EXPLAIN, etc.)',
              },
              params: {
                type: 'array',
                items: {
                  type: ['string', 'number', 'boolean', 'null'],
                },
                description: 'Query parameters (optional)',
              },
            },
            required: ['sql'],
          },
        },
        {
          name: 'execute',
          description: 'Execute a write SQL query that modifies data or schema. Supports INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE and other write statements.',
          inputSchema: {
            type: 'object',
            properties: {
              sql: {
                type: 'string',
                description: 'Write SQL query (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, etc.)',
              },
              params: {
                type: 'array',
                items: {
                  type: ['string', 'number', 'boolean', 'null'],
                },
                description: 'Query parameters (optional)',
              },
            },
            required: ['sql'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'connect_db':
          return await this.handleConnectDb(request.params.arguments);
        case 'query':
          return await this.handleQuery(request.params.arguments);
        case 'execute':
          return await this.handleExecute(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleConnectDb(args: any) {
    let newConfig: DatabaseConfig | null = null;

    // Try to parse from url first
    if (args.url) {
      try {
        newConfig = parseMySQLUrl(args.url);
      } catch (error: unknown) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid MySQL URL: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    } else if (args.host || args.user || args.password || args.database) {
      // Fall back to individual parameters
      if (!args.host || !args.user || args.password === undefined || args.password === null || !args.database) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Missing required database configuration parameters'
        );
      }
      newConfig = {
        host: args.host,
        user: args.user,
        password: args.password,
        database: args.database,
        port: args.port,
      };
    }

    // If no new config provided, use existing config from env
    if (!newConfig && !this.config) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'No database configuration provided'
      );
    }

    // Close existing connection if any
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }

    // Update config if new config provided
    if (newConfig) {
      this.config = newConfig;
    }

    try {
      await this.ensureConnection();
      return {
        content: [
          {
            type: 'text',
            text: 'Successfully connected to database',
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to connect to database: ${getErrorMessage(error)}`
      );
    }
  }

  private static readonly READONLY_PREFIXES = ['SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN'];
  private static readonly WRITE_PREFIXES = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME', 'REPLACE'];

  private async handleQuery(args: any) {
    await this.ensureConnection();

    if (!args.sql) {
      throw new McpError(ErrorCode.InvalidParams, 'SQL query is required');
    }

    const firstWord = args.sql.trim().split(/\s/)[0].toUpperCase();
    if (!MySQLServer.READONLY_PREFIXES.includes(firstWord)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Only read-only queries are allowed (${MySQLServer.READONLY_PREFIXES.join(', ')}). Use the execute tool for write operations.`
      );
    }

    try {
      const [rows] = await this.connection!.query(args.sql, args.params || []);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(rows, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Query execution failed: ${getErrorMessage(error)}`
      );
    }
  }

  private async handleExecute(args: any) {
    await this.ensureConnection();

    if (!args.sql) {
      throw new McpError(ErrorCode.InvalidParams, 'SQL query is required');
    }

    const firstWord = args.sql.trim().split(/\s/)[0].toUpperCase();
    if (MySQLServer.READONLY_PREFIXES.includes(firstWord)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Read-only queries are not allowed with execute tool. Use the query tool for ${firstWord} statements.`
      );
    }
    if (!MySQLServer.WRITE_PREFIXES.includes(firstWord)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unsupported statement: ${firstWord}. Allowed write operations: ${MySQLServer.WRITE_PREFIXES.join(', ')}`
      );
    }

    try {
      const [result] = await this.connection!.query(args.sql, args.params || []);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Query execution failed: ${getErrorMessage(error)}`
      );
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MySQL MCP server running on stdio');
  }
}

const server = new MySQLServer();
server.run().catch(console.error);
