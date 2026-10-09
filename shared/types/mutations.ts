export type MutationRef = { path: string };

export type MutationOp =
  | { op: 'set'; ref: MutationRef; data: object; merge?: boolean }
  | { op: 'update'; ref: MutationRef; data: object }
  | { op: 'delete'; ref: MutationRef };
