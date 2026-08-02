import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { handleStudioV2ActivepiecesCallback } from "~/features/flowcordia/workflows/studio-v2/activepieces-callback.server";

export async function loader({ request, params }: LoaderFunctionArgs): Promise<Response> {
  return handleStudioV2ActivepiecesCallback(request, params.target);
}

export async function action({ request, params }: ActionFunctionArgs): Promise<Response> {
  return handleStudioV2ActivepiecesCallback(request, params.target);
}
