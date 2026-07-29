import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod";
import { BuildingOffice2Icon, FolderIcon } from "@heroicons/react/20/solid";
import { json, redirect, type ActionFunction, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import { z } from "zod";
import { BackgroundWrapper } from "~/components/BackgroundWrapper";
import { AppContainer, MainCenteredContainer } from "~/components/layout/AppLayout";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { Fieldset } from "~/components/primitives/Fieldset";
import { FormButtons } from "~/components/primitives/FormButtons";
import { FormError } from "~/components/primitives/FormError";
import { FormTitle } from "~/components/primitives/FormTitle";
import { Hint } from "~/components/primitives/Hint";
import { Input } from "~/components/primitives/Input";
import { InputGroup } from "~/components/primitives/InputGroup";
import { Label } from "~/components/primitives/Label";
import { prisma } from "~/db.server";
import { featuresForRequest } from "~/features.server";
import { projectGitHubOnboardingPath } from "~/features/flowcordia/setup/hostedCustomerOnboarding";
import { redirectWithErrorMessage } from "~/models/message.server";
import { createOrganization } from "~/models/organization.server";
import { createProject } from "~/models/project.server";
import { NewOrganizationPresenter } from "~/presenters/NewOrganizationPresenter.server";
import { requireUser, requireUserId } from "~/services/session.server";
import { newProjectPath, organizationPath, rootPath } from "~/utils/pathBuilder";

const schema = z.object({
  orgName: z.string().min(3).max(50),
  projectName: z.string().trim().min(3).max(50).optional(),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const presenter = new NewOrganizationPresenter();
  const { hasOrganizations } = await presenter.call({ userId: userId });

  return typedjson({
    hasOrganizations,
    isManagedCloud: featuresForRequest(request).isManagedCloud,
  });
};

export const action: ActionFunction = async ({ request }) => {
  const user = await requireUser(request);
  const formData = await request.formData();
  const submission = parseWithZod(formData, { schema });

  if (submission.status !== "success") {
    return json(submission.reply());
  }

  try {
    const isManagedCloud = featuresForRequest(request).isManagedCloud;
    const existingMembership = isManagedCloud
      ? await prisma.orgMember.findFirst({
          where: { userId: user.id, organization: { deletedAt: null } },
          select: { id: true },
        })
      : null;
    const isFirstHostedWorkspace = isManagedCloud && !existingMembership;

    const organization = await createOrganization({
      title: submission.value.orgName,
      userId: user.id,
      companySize: null,
    });

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const configurationId = url.searchParams.get("configurationId");
    const integration = url.searchParams.get("integration");
    const next = url.searchParams.get("next");

    if (code && configurationId && integration === "vercel") {
      const params = new URLSearchParams({
        code,
        configurationId,
        integration,
      });
      if (next) {
        params.set("next", next);
      }
      const redirectUrl = `${organizationPath(organization)}/projects/new?${params.toString()}`;
      return redirect(redirectUrl);
    }

    if (isFirstHostedWorkspace) {
      try {
        const project = await createProject({
          organizationSlug: organization.slug,
          name: submission.value.projectName ?? "My workflows",
          userId: user.id,
          version: "v3",
        });
        return redirect(
          projectGitHubOnboardingPath({
            organizationSlug: organization.slug,
            projectSlug: project.slug,
          })
        );
      } catch (error) {
        return redirectWithErrorMessage(
          newProjectPath(organization),
          request,
          error instanceof Error
            ? `Your workspace was created, but the first project needs attention: ${error.message}`
            : "Your workspace was created, but the first project could not be created."
        );
      }
    }

    return redirect(organizationPath(organization));
  } catch (error: any) {
    return json({ errors: { body: error.message } }, { status: 400 });
  }
};

export default function NewOrganizationPage() {
  const { hasOrganizations, isManagedCloud } = useTypedLoaderData<typeof loader>();
  const lastSubmission = useActionData();
  const navigation = useNavigation();
  const isFirstHostedWorkspace = isManagedCloud && !hasOrganizations;

  const [form, { orgName, projectName }] = useForm({
    id: "create-organization",
    lastResult: lastSubmission as any,
    defaultValue: isFirstHostedWorkspace ? { projectName: "My workflows" } : undefined,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema });
    },
    shouldRevalidate: "onSubmit",
    shouldValidate: "onSubmit",
  });

  const isLoading = navigation.state === "submitting" || navigation.state === "loading";

  return (
    <AppContainer className="bg-charcoal-900">
      <BackgroundWrapper>
        <MainCenteredContainer
          variant="onboarding"
          className="max-w-[26rem] rounded-lg border border-grid-bright bg-background-dimmed p-5 shadow-lg"
        >
          <FormTitle
            LeadingIcon={<BuildingOffice2Icon className="size-6 text-fuchsia-600" />}
            title={isFirstHostedWorkspace ? "Create your workspace" : "Create an organization"}
            description={
              isFirstHostedWorkspace
                ? "Name your workspace and first project. You can change both later."
                : undefined
            }
          />
          <Form method="post" {...getFormProps(form)}>
            <Fieldset>
              <InputGroup>
                <Label htmlFor={orgName.id}>
                  {isFirstHostedWorkspace ? "Workspace name" : "Organization name"} *
                </Label>
                <Input
                  {...getInputProps(orgName, { type: "text" })}
                  placeholder={isFirstHostedWorkspace ? "Acme" : "Your organization name"}
                  icon={BuildingOffice2Icon}
                  autoFocus
                />
                <Hint>
                  {isFirstHostedWorkspace
                    ? "This is where your team and projects live."
                    : "Normally your company or team name."}
                </Hint>
                <FormError id={orgName.errorId}>{orgName.errors}</FormError>
              </InputGroup>
              {isFirstHostedWorkspace && (
                <InputGroup>
                  <Label htmlFor={projectName.id}>First project *</Label>
                  <Input
                    {...getInputProps(projectName, { type: "text" })}
                    placeholder="My workflows"
                    icon={FolderIcon}
                  />
                  <Hint>Flowcordia will open this project directly after GitHub is connected.</Hint>
                  <FormError id={projectName.errorId}>{projectName.errors}</FormError>
                </InputGroup>
              )}

              <FormButtons
                confirmButton={
                  <Button type="submit" variant={"primary/small"} isLoading={isLoading}>
                    {isFirstHostedWorkspace ? "Continue" : "Create"}
                  </Button>
                }
                cancelButton={
                  hasOrganizations ? (
                    <LinkButton to={rootPath()} variant={"secondary/small"}>
                      Cancel
                    </LinkButton>
                  ) : null
                }
              />
            </Fieldset>
          </Form>
        </MainCenteredContainer>
      </BackgroundWrapper>
    </AppContainer>
  );
}
