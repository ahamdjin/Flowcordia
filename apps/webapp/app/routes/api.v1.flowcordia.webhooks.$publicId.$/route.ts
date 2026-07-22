import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { handleFlowcordiaPublicWebhookIngress } from "~/features/flowcordia/workflows/webhook/ingress.server";

export async function loader({ request, params }: LoaderFunctionArgs): Promise<Response> {
  return handleFlowcordiaPublicWebhookIngress(request, params.publicId);
}

export async function action({ request, params }: ActionFunctionArgs): Promise<Response> {
  return handleFlowcordiaPublicWebhookIngress(request, params.publicId);
}
