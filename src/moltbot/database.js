const sql = require('mssql');

class DatabaseManager {
    constructor(config) {
        this.config = config;
        this.pool = null;
        this.isConnected = false;
    }

    async connect() {
        if (!this.config.enabled) {
            console.log('Database disabled in configuration');
            return false;
        }

        try {
            this.pool = await sql.connect(this.config.connectionString);
            this.isConnected = true;
            console.log('Database connected successfully');
            return true;
        } catch (error) {
            console.error('Database connection failed:', error.message);
            return false;
        }
    }

    async disconnect() {
        if (this.pool) {
            await this.pool.close();
            this.isConnected = false;
            console.log('Database disconnected');
        }
    }

    async query(sqlQuery, params = []) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        try {
            const request = this.pool.request();
            
            // Add parameters if provided
            params.forEach((param, index) => {
                request.input(`param${index}`, param);
            });

            const result = await request.query(sqlQuery);
            console.log(`Query executed: ${result.rowsAffected} rows affected`);
            return result.recordset;
        } catch (error) {
            console.error('Query failed:', error.message);
            throw error;
        }
    }

    async getTableSchema(tableName) {
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
        return await this.query(query);
    }

    async getTables() {
        const query = `
            SELECT TABLE_NAME, TABLE_TYPE
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME
        `;
        return await this.query(query);
    }

    async searchTables(searchTerm) {
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
        return await this.query(query);
    }

    async executeStoredProcedure(procedureName, params = {}) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        try {
            const request = this.pool.request();
            
            // Add parameters
            Object.keys(params).forEach(key => {
                request.input(key, params[key]);
            });

            const result = await request.execute(procedureName);
            console.log(`Stored procedure ${procedureName} executed`);
            return result.recordset;
        } catch (error) {
            console.error(`Stored procedure ${procedureName} failed:`, error.message);
            throw error;
        }
    }
}

module.exports = DatabaseManager;
