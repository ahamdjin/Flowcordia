import { describe, expect, it } from "vitest";
import {
  findDirectedCycles,
  isReachable,
  reachableFrom,
  stableTopologicalSort,
} from "../src/index.js";

const nodes = ["trigger", "alpha", "beta", "output"];
const edges = [
  { source: "trigger", target: "beta" },
  { source: "trigger", target: "alpha" },
  { source: "alpha", target: "output" },
  { source: "beta", target: "output" },
];

describe("Flowcordia graph foundation", () => {
  it("preserves stable lexical topological ordering", () => {
    expect(stableTopologicalSort(nodes, edges)).toEqual({
      orderedNodeIds: ["trigger", "alpha", "beta", "output"],
      cyclic: false,
    });
  });

  it("counts every parallel edge when releasing a successor", () => {
    expect(
      stableTopologicalSort(
        ["trigger", "output"],
        [
          { source: "trigger", target: "output" },
          { source: "trigger", target: "output" },
        ]
      )
    ).toEqual({
      orderedNodeIds: ["trigger", "output"],
      cyclic: false,
    });
  });

  it("provides shared reachability", () => {
    expect(isReachable(nodes, edges, "trigger", "output")).toBe(true);
    expect(isReachable(nodes, edges, "output", "trigger")).toBe(false);
    expect([...reachableFrom(nodes, edges, ["trigger"])].sort()).toEqual([...nodes].sort());
  });

  it("delegates cycle detection to Graphlib", () => {
    expect(
      findDirectedCycles(
        ["a", "b"],
        [
          { source: "a", target: "b" },
          { source: "b", target: "a" },
        ]
      )
    ).toHaveLength(1);
  });
});
