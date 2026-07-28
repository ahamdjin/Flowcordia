import { Form, type MetaFunction, useActionData, useNavigation } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/server-runtime";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import { z } from "zod";
import {
  MainHorizontallyCenteredContainer,
  PageBody,
  PageContainer,
} from "~/components/layout/AppLayout";
import { Button } from "~/components/primitives/Buttons";
import { Fieldset } from "~/components/primitives/Fieldset";
import { FormError } from "~/components/primitives/FormError";
import { Header2 } from "~/components/primitives/Headers";
import { Input } from "~/components/primitives/Input";
import { InputGroup } from "~/components/primitives/InputGroup";
import { Label } from "~/components/primitives/Label";
import { NavBar, PageTitle } from "~/components/primitives/PageHeader";
import { Paragraph } from "~/components/primitives/Paragraph";
import { SpinnerWhite } from "~/components/primitives/Spinner";
import { $replica } from "~/db.server";
import { featuresForRequest } from "~/features.server";
import { redirectWithSuccessMessage } from "~/models/message.server";
import {
  AdminPasswordSchema,
  hasAdminPassword,
  setAdminPassword,
} from "~/services/passwordAuth.server";
import { requireUser } from "~/services/session.server";
import {
  getAllowedSessionOptions,
  getEffectiveSessionDuration,
} from "~/services/sessionDuration.server";
import { MfaSetup } from "../resources.account.mfa.setup/route";
import { SessionDurationSetting } from "../resources.account.session-duration/SessionDurationSetting";

const PasswordSettingsSchema = z
  .object({
    intent: z.literal("set-admin-password"),
    currentPassword: z
      .string()
      .max(128)
      .optional()
      .transform((value) => (value ? value : undefined)),
    newPassword: AdminPasswordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((value, context) => {
    if (value.newPassword !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

type PasswordActionData = {
  error?: string;
  fieldErrors?: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
};

export const meta: MetaFunction = () => {
  return [
    {
      title: `Security | Trigger.dev`,
    },
  ];
};

function canManageLocalPassword(
  request: Request,
  user: Awaited<ReturnType<typeof requireUser>>
): boolean {
  return !featuresForRequest(request).isManagedCloud && user.admin && !user.isImpersonating;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);

  const { durationSeconds, orgCapSeconds } = await getEffectiveSessionDuration(user.id, $replica);
  const sessionDurationOptions = getAllowedSessionOptions(orgCapSeconds, durationSeconds);
  const showPasswordSettings = canManageLocalPassword(request, user);

  return typedjson({
    user,
    sessionDuration: durationSeconds,
    sessionDurationOptions,
    orgCapSeconds,
    showPasswordSettings,
    passwordConfigured: showPasswordSettings ? await hasAdminPassword(user.id) : false,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  if (!canManageLocalPassword(request, user)) {
    throw new Response("Not found", { status: 404 });
  }

  const parsed = PasswordSettingsSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return typedjson<PasswordActionData>(
      {
        error: "Check the password fields and try again.",
        fieldErrors: {
          currentPassword: flattened.currentPassword?.[0],
          newPassword: flattened.newPassword?.[0],
          confirmPassword: flattened.confirmPassword?.[0],
        },
      },
      { status: 400 }
    );
  }

  const result = await setAdminPassword({
    userId: user.id,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
  });
  if (!result.success) {
    return typedjson<PasswordActionData>(
      {
        error: result.message,
        fieldErrors: result.field ? { [result.field]: result.message } : undefined,
      },
      { status: 400 }
    );
  }

  return redirectWithSuccessMessage(
    "/account/security",
    request,
    "Administrator password saved successfully."
  );
}

export default function Page() {
  const {
    user,
    sessionDuration,
    sessionDurationOptions,
    orgCapSeconds,
    showPasswordSettings,
    passwordConfigured,
  } = useTypedLoaderData<typeof loader>();

  return (
    <PageContainer>
      <NavBar>
        <PageTitle title="Security" />
      </NavBar>

      <PageBody>
        <MainHorizontallyCenteredContainer className="max-w-[37.5rem] overflow-visible">
          <div className="w-full border-b border-grid-dimmed pb-3">
            <Header2>Security</Header2>
          </div>
          {showPasswordSettings && (
            <div className="w-full border-b border-grid-dimmed py-4">
              <AdminPasswordSettings passwordConfigured={passwordConfigured} />
            </div>
          )}
          <div className="w-full border-b border-grid-dimmed py-4">
            <MfaSetup isEnabled={!!user.mfaEnabledAt} />
          </div>
          <div className="w-full border-b border-grid-dimmed py-4">
            <SessionDurationSetting
              currentValue={sessionDuration}
              options={sessionDurationOptions}
              orgCapSeconds={orgCapSeconds}
            />
          </div>
        </MainHorizontallyCenteredContainer>
      </PageBody>
    </PageContainer>
  );
}

function AdminPasswordSettings({ passwordConfigured }: { passwordConfigured: boolean }) {
  const actionData = useActionData() as PasswordActionData | undefined;
  const navigation = useNavigation();
  const isSaving =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "set-admin-password";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Header2>Administrator password</Header2>
        <Paragraph variant="small" className="mt-1 text-text-dimmed">
          {passwordConfigured
            ? "Change the local password for this self-hosted administrator account."
            : "Create a local password so this administrator can sign in without email or OAuth."}
        </Paragraph>
      </div>
      <Form method="post">
        <Fieldset className="flex flex-col gap-3">
          {passwordConfigured && (
            <InputGroup fullWidth>
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                required
              />
              {actionData?.fieldErrors?.currentPassword && (
                <FormError>{actionData.fieldErrors.currentPassword}</FormError>
              )}
            </InputGroup>
          )}
          <InputGroup fullWidth>
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              required
            />
            <Paragraph variant="extra-small" className="text-text-dimmed">
              Use at least 15 characters. Spaces and passphrases are supported.
            </Paragraph>
            {actionData?.fieldErrors?.newPassword && (
              <FormError>{actionData.fieldErrors.newPassword}</FormError>
            )}
          </InputGroup>
          <InputGroup fullWidth>
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
              required
            />
            {actionData?.fieldErrors?.confirmPassword && (
              <FormError>{actionData.fieldErrors.confirmPassword}</FormError>
            )}
          </InputGroup>
          {actionData?.error && <FormError>{actionData.error}</FormError>}
          <div>
            <Button
              type="submit"
              name="intent"
              value="set-admin-password"
              variant="secondary/small"
              disabled={isSaving}
              LeadingIcon={isSaving ? SpinnerWhite : undefined}
            >
              {passwordConfigured ? "Change password" : "Create password"}
            </Button>
          </div>
        </Fieldset>
      </Form>
    </div>
  );
}
