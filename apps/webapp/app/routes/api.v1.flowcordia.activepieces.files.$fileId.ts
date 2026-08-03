import type { LoaderFunctionArgs } from "@remix-run/node";
import { readStudioV2ActivepiecesStepFile } from "~/features/flowcordia/workflows/studio-v2/activepieces-step-files.server";

function contentDisposition(fileName: string): string {
  return `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const fileId = params.fileId;
  const token = new URL(request.url).searchParams.get("token");
  if (!fileId || !token) {
    return Response.json({ code: "invalid_activepieces_file_token" }, { status: 401 });
  }

  try {
    const file = await readStudioV2ActivepiecesStepFile({ fileId, token });
    const headers = new Headers({
      "cache-control": "private, no-store",
      "content-type": file.contentType,
      "content-disposition": contentDisposition(file.fileName),
    });
    if (file.size !== null) headers.set("content-length", String(file.size));
    return new Response(file.body, { status: 200, headers });
  } catch {
    return Response.json({ code: "invalid_activepieces_file_token" }, { status: 401 });
  }
}
