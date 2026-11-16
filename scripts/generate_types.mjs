import postgres from 'postgres';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const match = env.match(/DATABASE_URL="?([^\r\n"]+)"?/);
const dbUrl = match ? match[1] : process.env.DATABASE_URL;

const sql = postgres(dbUrl, { ssl: { rejectUnauthorized: false } });

function mapPgTypeToTs(udt, dataType, isArray) {
  if (isArray || dataType === 'ARRAY') return 'string[]';
  switch (udt) {
    case 'uuid':
    case 'text':
    case 'varchar':
    case 'timestamptz':
    case 'timestamp':
    case 'date':
      return 'string';
    case 'int2':
    case 'int4':
    case 'int8':
    case 'numeric':
    case 'float4':
    case 'float8':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'json':
    case 'jsonb':
      return 'Json';
    default:
      return 'any';
  }
}

async function run() {
  try {
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;

    const columns = await sql`
      SELECT table_name, column_name, is_nullable, data_type, udt_name, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      ORDER BY table_name, ordinal_position;
    `;

    const tableCols = {};
    for (const c of columns) {
      if (!tableCols[c.table_name]) tableCols[c.table_name] = [];
      tableCols[c.table_name].push(c);
    }

    let out = `export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];\n\n`;
    out += `export type Database = {\n`;
    out += `  __InternalSupabase: {\n    PostgrestVersion: "14.18";\n  };\n`;
    out += `  public: {\n    Tables: {\n`;

    for (const t of tables) {
      const tName = t.table_name;
      const cols = tableCols[tName] || [];

      out += `      ${tName}: {\n`;
      // Row
      out += `        Row: {\n`;
      for (const col of cols) {
        const tsType = mapPgTypeToTs(col.udt_name, col.data_type, col.data_type === 'ARRAY');
        const nullable = col.is_nullable === 'YES' ? ' | null' : '';
        out += `          ${col.column_name}: ${tsType}${nullable};\n`;
      }
      out += `        };\n`;

      // Insert
      out += `        Insert: {\n`;
      for (const col of cols) {
        const tsType = mapPgTypeToTs(col.udt_name, col.data_type, col.data_type === 'ARRAY');
        const optional = col.is_nullable === 'YES' || col.column_default !== null ? '?:' : ':';
        const nullable = col.is_nullable === 'YES' ? ' | null' : '';
        out += `          ${col.column_name}${optional} ${tsType}${nullable};\n`;
      }
      out += `        };\n`;

      // Update
      out += `        Update: {\n`;
      for (const col of cols) {
        const tsType = mapPgTypeToTs(col.udt_name, col.data_type, col.data_type === 'ARRAY');
        out += `          ${col.column_name}?: ${tsType} | null;\n`;
      }
      out += `        };\n`;
      out += `        Relationships: [];\n`;
      out += `      };\n`;
    }

    out += `    };\n    Views: {};\n    Functions: {};\n    Enums: {};\n    CompositeTypes: {};\n  };\n};\n\n`;
    out += `type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;\n`;
    out += `type DefaultSchema = DatabaseWithoutInternals["public"];\n\n`;
    out += `export type Tables<TableName extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])> = (DefaultSchema["Tables"] & DefaultSchema["Views"])[TableName] extends { Row: infer R } ? R : never;\n`;
    out += `export type TablesInsert<TableName extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][TableName] extends { Insert: infer I } ? I : never;\n`;
    out += `export type TablesUpdate<TableName extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][TableName] extends { Update: infer U } ? U : never;\n`;

    fs.writeFileSync('src/integrations/supabase/types.ts', out, 'utf8');
    console.log('Successfully generated src/integrations/supabase/types.ts for all', tables.length, 'tables!');
  } catch (err) {
    console.error('Error generating types:', err);
  } finally {
    await sql.end();
  }
}

run();
