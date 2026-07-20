from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one {label}, found {count}")
    file.write_text(source.replace(old, new, 1))


route = "apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.flowcordia.proposals/route.tsx"
replace_once(
    route,
    '''      <PageBody scrollable={false} className="bg-background-dimmed">
        {data.configurationError || !data.repository ? (
''',
    '''      <PageBody scrollable={false} className="bg-background-dimmed">
        <div
          data-testid="flowcordia-proposal-route"
          data-connected={data.configurationError || !data.repository ? "false" : "true"}
          className="h-full"
        >
          {data.configurationError || !data.repository ? (
''',
    "proposal route acceptance root",
)
replace_once(
    route,
    '''        )}
      </PageBody>
''',
    '''          )}
        </div>
      </PageBody>
''',
    "proposal route acceptance closure",
)

workspace = "apps/webapp/app/features/flowcordia/proposals/workspace/ProposalWorkspace.tsx"
replace_once(
    workspace,
    '''  return (
    <div className="flex h-full min-h-0 flex-col">
      <ProposalGovernancePanel
''',
    '''  return (
    <div
      data-testid="flowcordia-proposal-workspace"
      data-proposal-id={selected?.proposalId ?? ""}
      data-repository-owner={repository.owner}
      data-repository-name={repository.name}
      data-repository-branch={repository.branch}
      data-can-write={canWrite ? "true" : "false"}
      data-proposal-state={selected?.state ?? ""}
      data-proposal-head={selected?.git.headSha ?? ""}
      data-merge-commit={selected?.pullRequest?.mergeCommitSha ?? ""}
      data-available-action={selected?.availableAction ?? ""}
      data-governance-state={selectedGovernance.state}
      data-governance-head={selectedGovernance.evaluatedHeadSha ?? ""}
      className="flex h-full min-h-0 flex-col"
    >
      <ProposalGovernancePanel
''',
    "proposal workspace acceptance root",
)
replace_once(
    workspace,
    '''                    <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="primary/small"
''',
    '''                    <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
                      <DialogTrigger asChild>
                        <Button
                          data-testid="flowcordia-promotion-open"
                          variant="primary/small"
''',
    "promotion dialog trigger",
)
replace_once(
    workspace,
    '''                          <select
                            value={mergeMethod}
''',
    '''                          <select
                            data-testid="flowcordia-promotion-merge-method"
                            value={mergeMethod}
''',
    "promotion merge method",
)
replace_once(
    workspace,
    '''                          <Button
                            variant="primary/small"
                            LeadingIcon={CheckCircle2Icon}
                            isLoading={isSubmitting}
                            disabled={!promotionReady || isSubmitting}
                            onClick={() => {
                              runCommand("promote");
''',
    '''                          <Button
                            data-testid="flowcordia-promotion-confirm"
                            variant="primary/small"
                            LeadingIcon={CheckCircle2Icon}
                            isLoading={isSubmitting}
                            disabled={!promotionReady || isSubmitting}
                            onClick={() => {
                              runCommand("promote");
''',
    "promotion confirmation",
)

connections = Path("flowcordia/connections/README.md")
connections_source = connections.read_text()
connections_anchor = "| Protected connected-acceptance workflow | Authenticated Studio, readiness command, structural command, and exact-head preview run | Produce sanitized environment-backed evidence that local CI cannot prove | Manual readiness, existing-draft structural, and existing-READY-proposal live modes delivered; promotion, production, and rollback evidence remain mandatory |\n"
connections_row = "| Protected governed-promotion workflow | Existing proposal workspace promotion command | Prove one policy-satisfied exact head merges through the authorized Studio path without creating approvals or bypassing repository rules | Manual destructive promotion acceptance delivered for a dedicated reference repository; production execution and rollback evidence remain mandatory |\n"
if connections_row not in connections_source:
    if connections_anchor not in connections_source:
        raise SystemExit("connection registry promotion anchor changed")
    connections_source = connections_source.replace(
        connections_anchor, connections_anchor + connections_row, 1
    )
if connections_source.count(connections_row) != 1:
    raise SystemExit("governed promotion connection row is missing or duplicated")
connections.write_text(connections_source)

roadmap = Path("flowcordia/product/roadmap.md")
roadmap_source = roadmap.read_text()
roadmap_anchor = "- Add a protected manual connected-acceptance harness for readiness, existing-draft structural preview, and existing-READY-proposal exact-head live proof with sanitized evidence only. — delivered; an authenticated environment run is still required to create the record\n"
roadmap_row = "- Add a protected governed-promotion acceptance harness requiring exact reference-repository identity, explicit destructive confirmation, `SATISFIED` policy evidence, and the existing server-owned promotion command. — delivered; a protected environment run is still required, and production/rollback proof remains separate\n"
if roadmap_row not in roadmap_source:
    if roadmap_anchor not in roadmap_source:
        raise SystemExit("promotion roadmap anchor changed")
    roadmap_source = roadmap_source.replace(roadmap_anchor, roadmap_anchor + roadmap_row, 1)
roadmap.write_text(roadmap_source)

rollout = Path("flowcordia/runbooks/proposal-governance-rollout.md")
rollout_source = rollout.read_text()
rollout_section = '''## Protected promotion automation

The manual **Flowcordia governed promotion acceptance** workflow automates only steps 7–10 of the connected acceptance sequence after an operator has prepared one exact proposal head and policy-satisfied GitHub evidence. It requires a dedicated protected environment, exact reference-repository coordinates, the exact proposal and head, and the destructive confirmation `PROMOTE_FLOWCORDIA_REFERENCE_PROPOSAL`.

The harness uses the existing Studio promotion dialog and server command. It cannot create approvals, change policy, bypass repository rules, trigger production, or roll back. A failure after the final confirmation may have caused a real merge; inspect GitHub and the durable proposal before any rerun.

'''
if rollout_section not in rollout_source:
    rollout_source = rollout_source.replace("## Negative and resilience checks\n", rollout_section + "## Negative and resilience checks\n", 1)
rollout.write_text(rollout_source)

release = Path("flowcordia/runbooks/release-acceptance.md")
release_source = release.read_text()
release_note = '''#### Protected promotion evidence

After the exact proposal is `READY`, function validation and governance are satisfied, and required approvals/checks are present, the manual **Flowcordia governed promotion acceptance** workflow may execute the existing **Verify and promote** UI command for the dedicated reference repository. Its artifact proves only the policy-governed merge. Production execution and rollback remain steps 8 and must use a separate acceptance record.

'''
if release_note not in release_source:
    release_source = release_source.replace("### 8. Prove production and rollback\n", release_note + "### 8. Prove production and rollback\n", 1)
release.write_text(release_source)

for path, required in {
    route: ['data-testid="flowcordia-proposal-route"', 'data-connected='],
    workspace: [
        'data-testid="flowcordia-proposal-workspace"',
        'data-testid="flowcordia-promotion-open"',
        'data-testid="flowcordia-promotion-merge-method"',
        'data-testid="flowcordia-promotion-confirm"',
        'data-governance-state=',
        'data-merge-commit=',
    ],
}.items():
    source = Path(path).read_text()
    for value in required:
        if value not in source:
            raise SystemExit(f"{path}: missing final promotion invariant {value}")
print("PR39 governed promotion acceptance transform passed")
