declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: any[]): void;
    exec(sql: string, params?: any[]): QueryExecResult[];
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
    wasmBinary?: any;
  }

  const initSqlJs: (config?: SqlJsConfig) => Promise<{
    Database: new (data?: Uint8Array) => Database;
  }>;

  export default initSqlJs;
}
