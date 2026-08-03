from pathlib import Path

path = Path("internal-packages/database/prisma/schema.prisma")
text = path.read_text()
model = '''model FlowcordiaActivepiecesStepFile {
  id String @id @default(cuid())

  organizationId       String
  projectId            String
  runtimeEnvironmentId String
  workflowId           String

  storagePath String
  fileName    String
  contentType String
  size        Int?
  metadata    Json?
  expiresAt   DateTime

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([runtimeEnvironmentId, workflowId], map: "FlowcordiaActivepiecesStepFile_environment_workflow_idx")
  @@index([expiresAt], map: "FlowcordiaActivepiecesStepFile_expiry_idx")
}

'''
anchor = "model FlowcordiaWebhookEndpoint {"
if "model FlowcordiaActivepiecesStepFile {" not in text:
    if anchor not in text:
        raise SystemExit("step-file schema anchor not found")
    text = text.replace(anchor, model + anchor, 1)
path.write_text(text)
