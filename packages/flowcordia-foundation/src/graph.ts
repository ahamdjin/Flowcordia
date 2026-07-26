import { Graph, alg } from "@dagrejs/graphlib";

export interface DirectedEdge {
  source: string;
  target: string;
}

export function createDirectedGraph(
  nodeIds: readonly string[],
  edges: readonly DirectedEdge[]
): Graph {
  const graph = new Graph({ directed: true, multigraph: true, compound: false });
  for (const nodeId of nodeIds) graph.setNode(nodeId);
  edges.forEach((edge, index) => graph.setEdge(edge.source, edge.target, undefined, String(index)));
  return graph;
}

export function isReachable(
  nodeIds: readonly string[],
  edges: readonly DirectedEdge[],
  start: string,
  target: string
): boolean {
  if (start === target) return true;
  const graph = createDirectedGraph(nodeIds, edges);
  if (!graph.hasNode(start) || !graph.hasNode(target)) return false;
  const visited = new Set<string>();
  const pending = [start];
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    for (const successor of graph.successors(current) ?? []) {
      if (successor === target) return true;
      if (!visited.has(successor)) pending.push(successor);
    }
  }
  return false;
}

export function reachableFrom(
  nodeIds: readonly string[],
  edges: readonly DirectedEdge[],
  starts: readonly string[]
): ReadonlySet<string> {
  const graph = createDirectedGraph(nodeIds, edges);
  const reached = new Set<string>();
  const pending = [...starts].filter((nodeId) => graph.hasNode(nodeId));
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || reached.has(current)) continue;
    reached.add(current);
    pending.push(...(graph.successors(current) ?? []));
  }
  return reached;
}

/**
 * Stable Kahn ordering backed by Graphlib's graph structure. The lexical ready-queue policy
 * preserves Flowcordia's historical deterministic compiler order.
 */
export function stableTopologicalSort(
  nodeIds: readonly string[],
  edges: readonly DirectedEdge[]
): { orderedNodeIds: string[]; cyclic: boolean } {
  const graph = createDirectedGraph(nodeIds, edges);
  const indegree = new Map(nodeIds.map((nodeId) => [nodeId, graph.inEdges(nodeId)?.length ?? 0]));
  const ready = nodeIds.filter((nodeId) => indegree.get(nodeId) === 0).sort();
  const orderedNodeIds: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift()!;
    orderedNodeIds.push(current);
    const outgoing = [...(graph.outEdges(current) ?? [])].sort(
      (left, right) =>
        left.w.localeCompare(right.w) || (left.name ?? "").localeCompare(right.name ?? "")
    );
    for (const edge of outgoing) {
      const successor = edge.w;
      const next = (indegree.get(successor) ?? 1) - 1;
      indegree.set(successor, next);
      if (next === 0) {
        ready.push(successor);
        ready.sort();
      }
    }
  }
  return { orderedNodeIds, cyclic: orderedNodeIds.length !== nodeIds.length };
}

export function findDirectedCycles(
  nodeIds: readonly string[],
  edges: readonly DirectedEdge[]
): readonly (readonly string[])[] {
  return alg.findCycles(createDirectedGraph(nodeIds, edges)).map((cycle) => [...cycle]);
}
