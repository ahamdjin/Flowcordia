import type { MetaFunction } from "@remix-run/node";
import { FlaskConicalIcon, GitBranchIcon } from "lucide-react";
import { PageBody, PageContainer } from "~/components/layout/AppLayout";
import { Badge } from "~/components/primitives/Badge";
import { NavBar, PageAccessories, PageTitle } from "~/components/primitives/PageHeader";
import { StudioV2Surface } from "~/features/flowcordia/workflows/studio-v2/StudioV2Surface";

export const meta: MetaFunction = () => [{ title: "Studio V2 Preview | Flowcordia" }];

export default function FlowcordiaStudioV2PreviewRoute() {
  return (
    <PageContainer>
      <NavBar>
        <PageTitle
          title="Studio V2 Preview"
          accessory="Local-first workflow authoring built on Flowcordia-owned contracts."
        />
        <PageAccessories>
          <Badge className="border border-amber-500/30 bg-amber-500/10 text-amber-200 [&>span]:flex [&>span]:items-center [&>span]:gap-1">
            <FlaskConicalIcon className="size-3" />
            Isolated preview
          </Badge>
          <Badge className="border border-zinc-500/30 bg-zinc-500/10 text-zinc-300 [&>span]:flex [&>span]:items-center [&>span]:gap-1">
            <GitBranchIcon className="size-3" />
            GitHub optional
          </Badge>
        </PageAccessories>
      </NavBar>
      <PageBody scrollable className="bg-background-dimmed p-4 xl:p-6">
        <div
          data-testid="flowcordia-studio-v2-preview-route"
          data-source-control="optional"
          data-persistence="in-memory"
          className="mx-auto w-full max-w-[1800px]"
        >
          <StudioV2Surface />
        </div>
      </PageBody>
    </PageContainer>
  );
}
