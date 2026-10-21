export const EVENTS = [
  "manual",
  "order.created",
  "checkout.started",
  "checkout.abandoned",
  "quiz.abandoned",
  "payment.approved",
  "payment.failed",
  "payment.expired",
  "refund.completed",
  "chargeback.received",
  "contact.updated",
  "custom",
] as const;
export const NODE_TYPES = [
  "trigger",
  "condition",
  "wait",
  "message",
  "tag",
  "update_contact",
  "crm_task",
  "webhook",
  "agent",
  "end",
  "note",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];
export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: { label: string; config: Record<string, any> };
}
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}
export interface Graph {
  schemaVersion: 1;
  nodes: FlowNode[];
  edges: FlowEdge[];
}
export interface Issue {
  nodeId?: string;
  message: string;
}
export type Query = (sql: string, params?: any[]) => Promise<any[]>;
export interface Job {
  id: string;
  run_id: string;
  node_id: string;
  lease_token: string;
  attempts: number;
  max_attempts: number;
}
export interface EventInput {
  userId: string;
  sourceId?: string;
  externalId: string;
  type: string;
  orderId?: string;
  dealId?: string;
  productId?: string;
  payload?: Record<string, unknown>;
}
