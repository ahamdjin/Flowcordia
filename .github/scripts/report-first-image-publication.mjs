import { appendFile } from "node:fs/promises";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GH_TOKEN;
const requestSha = process.env.REQUEST_SHA;
const requestWorkflow = process.env.REQUEST_WORKFLOW;
const publicationWorkflow = process.env.PUBLICATION_WORKFLOW;
const reportIssue = process.env.REPORT_ISSUE;

if (
  !repository ||
  !token ||
  !requestSha ||
  !requestWorkflow ||
  !publicationWorkflow ||
  !reportIssue
) {
  throw new Error("Publication reporter configuration is incomplete.");
}

const apiBase = `https://api.github.com/repos/${repository}`;
const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "User-Agent": "flowcordia-publication-reporter",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function github(path, init = {}) {
  const response = await fetch(`${apiBase}/${path}`, {
    ...init,
    headers: {
      ...headers,
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed for ${path} with status ${response.status}.`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function latestExactRun(runs) {
  return (
    runs
      .filter((run) => run.head_sha === requestSha)
      .sort((left, right) => left.created_at.localeCompare(right.created_at))
      .at(-1) ?? null
  );
}

function runLine(label, run) {
  if (!run) {
    return `- ${label}: **not found**`;
  }

  const conclusion = run.conclusion ?? "pending";
  return `- ${label}: **${run.status} / ${conclusion}** — [run ${run.id}](${run.html_url})`;
}

const requestQuery = new URLSearchParams({
  event: "push",
  branch: "main",
  per_page: "20",
});
const publicationQuery = new URLSearchParams({
  event: "workflow_dispatch",
  branch: "main",
  per_page: "20",
});

const requestRuns = await github(
  `actions/workflows/${requestWorkflow}/runs?${requestQuery.toString()}`
);
const publicationRuns = await github(
  `actions/workflows/${publicationWorkflow}/runs?${publicationQuery.toString()}`
);

const requestRun = latestExactRun(requestRuns.workflow_runs ?? []);
const publicationRun = latestExactRun(publicationRuns.workflow_runs ?? []);
const lines = [
  "## First self-host image publication status",
  "",
  `Exact requested application commit: \`${requestSha}\``,
  "",
  runLine("Request workflow", requestRun),
];

if (!publicationRun) {
  lines.push("- Protected publication workflow: **not dispatched**");
} else {
  lines.push(runLine("Protected publication workflow", publicationRun));
  const jobs = await github(`actions/runs/${publicationRun.id}/jobs?per_page=100`);
  lines.push("", "### Publication jobs");
  for (const job of jobs.jobs ?? []) {
    lines.push(`- \`${job.name}\`: **${job.status} / ${job.conclusion ?? "pending"}**`);
  }
}

const body = `${lines.join("\n")}\n`;
console.log(body);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, body, "utf8");
}

try {
  await github(`issues/${reportIssue}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
} catch (error) {
  console.error("Publication status was read, but the PR comment could not be posted.");
  console.error(error instanceof Error ? error.message : "Unknown comment failure.");
}
