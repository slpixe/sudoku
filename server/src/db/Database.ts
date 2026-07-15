export interface QueryResult<Row> {
  rows: Row[];
  rowCount: number;
}

export interface QueryExecutor {
  query<Row>(text: string, values?: readonly unknown[]): Promise<QueryResult<Row>>;
  executeScript(text: string): Promise<void>;
}

export interface Database extends QueryExecutor {
  transaction<T>(work: (tx: QueryExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
