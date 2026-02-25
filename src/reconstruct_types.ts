import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

async function introspect() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('✅ Ligado à base de dados para introspeção (v5.1)...');

        // 1. Fetch Relationships (Foreign Keys)
        const relQuery = `
            SELECT
                tc.table_name, 
                kcu.column_name, 
                ccu.table_name AS referenced_table_name,
                ccu.column_name AS referenced_column_name,
                tc.constraint_name
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
        `;
        const { rows: allRelationships } = await client.query(relQuery);

        const tablesQuery = `
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        `;
        const { rows: tables } = await client.query(tablesQuery);

        let output = `export type Json =\n  | string\n  | number\n  | boolean\n  | null\n  | { [key: string]: Json | undefined }\n  | Json[]\n\n`;
        output += `export type Database = {\n  public: {\n    Tables: {\n`;

        for (const table of tables) {
            const tableName = table.table_name;
            console.log(`🔍 A processar tabela: ${tableName}...`);

            const columnsQuery = `
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = $1 AND table_schema = 'public'
                ORDER BY ordinal_position;
            `;
            const { rows: columns } = await client.query(columnsQuery, [tableName]);

            output += `      ${tableName}: {\n`;

            // Row
            output += `        Row: {\n`;
            for (const col of columns) {
                const tsType = mapPostgresToTs(col.data_type, col.column_name);
                const nullable = col.is_nullable === 'YES' ? ' | null' : '';
                output += `          ${col.column_name}: ${tsType}${nullable}\n`;
            }
            output += `        }\n`;

            // Insert
            output += `        Insert: {\n`;
            for (const col of columns) {
                const tsType = mapPostgresToTs(col.data_type, col.column_name);
                const nullable = col.is_nullable === 'YES' ? ' | null' : '';
                const hasDefault = col.column_default !== null || (col.column_name === 'id'); // Heuristic: 'id' is almost always serial/generated
                const isNullable = col.is_nullable === 'YES';
                const optional = (hasDefault || isNullable) ? '?' : '';
                output += `          ${col.column_name}${optional}: ${tsType}${nullable}\n`;
            }
            output += `        }\n`;

            // Update
            output += `        Update: {\n`;
            for (const col of columns) {
                const tsType = mapPostgresToTs(col.data_type, col.column_name);
                const nullable = col.is_nullable === 'YES' ? ' | null' : '';
                output += `          ${col.column_name}?: ${tsType}${nullable}\n`;
            }
            output += `        }\n`;

            // Relationships
            const tableRels = allRelationships.filter(r => r.table_name === tableName);
            if (tableRels.length === 0) {
                output += `        Relationships: []\n`;
            } else {
                output += `        Relationships: [\n`;
                for (const rel of tableRels) {
                    output += `          {\n`;
                    output += `            foreignKeyName: "${rel.constraint_name}"\n`;
                    output += `            columns: ["${rel.column_name}"]\n`;
                    output += `            isOneToOne: false\n`; // Default to false
                    output += `            referencedRelation: "${rel.referenced_table_name}"\n`;
                    output += `            referencedColumns: ["${rel.referenced_column_name}"]\n`;
                    output += `          },\n`;
                }
                output += `        ]\n`;
            }

            output += `      }\n`;
        }

        output += `    }\n    Views: {\n      [_ in never]: never\n    }\n    Functions: {\n      [_ in never]: never\n    }\n    Enums: {\n      [_ in never]: never\n    }\n    CompositeTypes: {\n      [_ in never]: never\n    }\n  }\n}\n`;

        const typesDir = path.join(__dirname, 'types');
        if (!fs.existsSync(typesDir)) fs.mkdirSync(typesDir, { recursive: true });

        fs.writeFileSync(path.join(typesDir, 'db.types.ts'), output);
        console.log('✅ Ficheiro src/types/db.types.ts reconstruído com sucesso (v5.1)!');

    } catch (err) {
        console.error('❌ Erro na introspeção:', err);
    } finally {
        await client.end();
    }
}

function mapPostgresToTs(pgType: string, columnName: string): string {
    if (columnName === 'serviceType' || columnName === 'parts' || pgType === 'jsonb' || pgType === 'json') {
        return 'Json';
    }

    switch (pgType) {
        case 'integer':
        case 'bigint':
        case 'numeric':
        case 'real':
        case 'double precision':
        case 'smallint':
            return 'number';
        case 'boolean':
            return 'boolean';
        case 'timestamp with time zone':
        case 'timestamp without time zone':
        case 'date':
        case 'time':
        case 'time without time zone':
        case 'text':
        case 'character varying':
        case 'uuid':
        case 'character':
            return 'string';
        default:
            return 'any';
    }
}

introspect();
