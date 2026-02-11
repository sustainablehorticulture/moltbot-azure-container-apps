const sql = require('mssql');

class DatabaseManager {
    constructor(config) {
        this.config = config;
        this.pools = {};          // keyed by database name
        this.activeDb = null;     // currently selected database name
        this.isConnected = false;
        this.serverConfig = null; // parsed server connection config (no database)
    }

    parseConnectionString(connStr) {
        const parts = {};
        connStr.split(';').forEach(part => {
            const [key, ...rest] = part.split('=');
            if (key && rest.length) {
                parts[key.trim().toLowerCase()] = rest.join('=').trim();
            }
        });
        return {
            server: parts['server'] || parts['data source'],
            user: parts['user id'] || parts['uid'] || parts['user'],
            password: parts['password'] || parts['pwd'],
            options: {
                encrypt: (parts['encrypt'] || 'true').toLowerCase() === 'true',
                trustServerCertificate: (parts['trustservercertificate'] || 'false').toLowerCase() === 'true',
                requestTimeout: 30000
            }
        };
    }

    async connect() {
        if (!this.config.enabled) {
            console.log('Database disabled in configuration');
            return false;
        }

        try {
            this.serverConfig = this.parseConnectionString(this.config.connectionString);

            // Connect to each configured database
            const dbNames = this.config.databases || [];
            for (const dbName of dbNames) {
                await this.connectToDatabase(dbName);
            }

            // Set the first database as active by default
            if (dbNames.length > 0) {
                this.activeDb = dbNames[0];
            }

            this.isConnected = Object.keys(this.pools).length > 0;
            console.log(`Database manager connected to ${Object.keys(this.pools).length} database(s): ${Object.keys(this.pools).join(', ')}`);
            return this.isConnected;
        } catch (error) {
            console.error('Database connection failed:', error.message);
            return false;
        }
    }

    async connectToDatabase(dbName) {
        if (this.pools[dbName]) {
            return this.pools[dbName];
        }

        try {
            const poolConfig = {
                ...this.serverConfig,
                database: dbName
            };
            const pool = new sql.ConnectionPool(poolConfig);
            await pool.connect();
            this.pools[dbName] = pool;
            console.log(`Connected to database: ${dbName}`);
            return pool;
        } catch (error) {
            console.error(`Failed to connect to database '${dbName}':`, error.message);
            throw error;
        }
    }

    async disconnect() {
        for (const [dbName, pool] of Object.entries(this.pools)) {
            await pool.close();
            console.log(`Disconnected from database: ${dbName}`);
        }
        this.pools = {};
        this.activeDb = null;
        this.isConnected = false;
        console.log('All database connections closed');
    }

    getPool(dbName) {
        const name = dbName || this.activeDb;
        if (!name) {
            throw new Error('No database selected. Use "use database [name]" to select one.');
        }
        const pool = this.pools[name];
        if (!pool) {
            throw new Error(`Database '${name}' is not connected. Available: ${Object.keys(this.pools).join(', ')}`);
        }
        return pool;
    }

    useDatabase(dbName) {
        if (!this.pools[dbName]) {
            throw new Error(`Database '${dbName}' is not connected. Available: ${Object.keys(this.pools).join(', ')}`);
        }
        this.activeDb = dbName;
        return `Switched to database '${dbName}'`;
    }

    listConnectedDatabases() {
        return Object.keys(this.pools).map(name => ({
            name,
            active: name === this.activeDb
        }));
    }

    async query(sqlQuery, params = [], dbName = null) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        const pool = this.getPool(dbName);

        try {
            const request = pool.request();
            
            // Add parameters if provided
            params.forEach((param, index) => {
                request.input(`param${index}`, param);
            });

            const result = await request.query(sqlQuery);
            console.log(`Query executed on '${dbName || this.activeDb}': ${result.rowsAffected} rows affected`);
            return result.recordset;
        } catch (error) {
            console.error('Query failed:', error.message);
            throw error;
        }
    }

    async getTableSchema(tableName, dbName = null) {
        const query = `
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                COLUMN_DEFAULT
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = '${tableName}'
            ORDER BY ORDINAL_POSITION
        `;
        return await this.query(query, [], dbName);
    }

    async getTables(dbName = null) {
        const query = `
            SELECT TABLE_NAME, TABLE_TYPE
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `;
        return await this.query(query, [], dbName);
    }

    async getTablesAllDatabases() {
        const allTables = {};
        for (const dbName of Object.keys(this.pools)) {
            try {
                allTables[dbName] = await this.getTables(dbName);
            } catch (error) {
                allTables[dbName] = { error: error.message };
            }
        }
        return allTables;
    }

    async searchTables(searchTerm, dbName = null) {
        const query = `
            SELECT 
                t.TABLE_NAME,
                c.COLUMN_NAME,
                c.DATA_TYPE
            FROM INFORMATION_SCHEMA.TABLES t
            JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
            WHERE t.TABLE_TYPE = 'BASE TABLE'
            AND (t.TABLE_NAME LIKE '%${searchTerm}%' 
                 OR c.COLUMN_NAME LIKE '%${searchTerm}%')
            ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
        `;
        return await this.query(query, [], dbName);
    }

    async searchAllDatabases(searchTerm) {
        const allResults = {};
        for (const dbName of Object.keys(this.pools)) {
            try {
                allResults[dbName] = await this.searchTables(searchTerm, dbName);
            } catch (error) {
                allResults[dbName] = { error: error.message };
            }
        }
        return allResults;
    }

    async executeStoredProcedure(procedureName, params = {}, dbName = null) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        const pool = this.getPool(dbName);

        try {
            const request = pool.request();
            
            // Add parameters
            Object.keys(params).forEach(key => {
                request.input(key, params[key]);
            });

            const result = await request.execute(procedureName);
            console.log(`Stored procedure ${procedureName} executed on '${dbName || this.activeDb}'`);
            return result.recordset;
        } catch (error) {
            console.error(`Stored procedure ${procedureName} failed:`, error.message);
            throw error;
        }
    }
}

module.exports = DatabaseManager;
