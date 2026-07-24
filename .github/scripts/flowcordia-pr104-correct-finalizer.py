from pathlib import Path

path = Path(".github/scripts/flowcordia-pr104-finalize.py")
text = path.read_text()
replacements = {
    '''      "deploymentVersion",
      "run",
    ]);
  exact(productionProof.expectedHeadSha''': '''    "deploymentVersion",
    "run",
  ]);
  exact(productionProof.expectedHeadSha''',
    '''      "deploymentVersion",
      "closure",
      "run",
    ]);
  exact(productionProof.expectedHeadSha''': '''    "deploymentVersion",
    "closure",
    "run",
  ]);
  exact(productionProof.expectedHeadSha''',
    '''      "deploymentVersion",
      "run",
    ]);
  exact(
    rollbackProductionProof.expectedHeadSha''': '''      "deploymentVersion",
      "run",
    ]
  );
  exact(
    rollbackProductionProof.expectedHeadSha''',
    '''      "deploymentVersion",
      "closure",
      "run",
    ]);
  exact(
    rollbackProductionProof.expectedHeadSha''': '''      "deploymentVersion",
      "closure",
      "run",
    ]
  );
  exact(
    rollbackProductionProof.expectedHeadSha''',
}
for old, new in replacements.items():
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one finalizer marker, found {count}: {old[:80]!r}")
    text = text.replace(old, new)
path.write_text(text)
