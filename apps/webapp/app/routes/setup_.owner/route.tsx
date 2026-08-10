import { LockClosedIcon } from "@heroicons/react/20/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { typedjson } from "remix-typedjson";
import { z } from "zod";
import { LoginPageLayout } from "~/components/LoginPageLayout";
import { Button } from "~/components/primitives/Buttons";
import { Fieldset } from "~/components/primitives/Fieldset";
import { FormError } from "~/components/primitives/FormError";
import { Header1 } from "~/components/primitives/Headers";
import { Input } from "~/components/primitives/Input";
import { InputGroup } from "~/components/primitives/InputGroup";
import { Paragraph } from "~/components/primitives/Paragraph";
import { Spinner } from "~/components/primitives/Spinner";
import {
  claimFirstOwner,
  FirstOwnerClaimError,
  getFirstOwnerState,
  isFirstOwnerClaimOpen,
} from "~/features/flowcordia/setup/firstOwner.server";
import {
  checkFirstOwnerRateLimit,
  FirstOwnerRateLimitError,
} from "~/features/flowcordia/setup/firstOwnerRateLimiter.server";
import { ensureSelfHostFirstRunTarget } from "~/features/flowcordia/setup/selfHostFirstRun.server";
import { authenticator } from "~/services/auth.server";
import { setLastAuthMethodHeader } from "~/services/lastAuthMethod.server";
import { logger } from "~/services/logger.server";
import { AdminPasswordSchema } from "~/services/passwordAuth.server";
import { postAuthentication } from "~/services/postAuth.server";
import { commitAuthenticatedSession } from "~/services/sessionDuration.server";
import { getUserSession } from "~/services/sessionStorage.server";
import { extractClientIp } from "~/utils/extractClientIp.server";

const FirstOwnerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    name: z
      .string()
      .trim()
      .max(80, "Name must not exceed 80 characters.")
      .optional()
      .transform((value) => value || undefined),
    password: AdminPasswordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

type ActionData = {
  error?: string;
  fieldErrors?: Partial<Record<keyof z.infer<typeof FirstOwnerSchema>, string>>;
};

export const meta: MetaFunction = () => [{ title: "Create your Flowcordia administrator" }];

function isSameOriginSetupRequest(request: Request): boolean {
  const expectedOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== expectedOrigin) return false;

  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === null || fetchSite === "none" || fetchSite === "same-origin";
}

export async function loader({ request: _request }: LoaderFunctionArgs) {
  const state = await getFirstOwnerState();
  if (!state.isSelfHosted || !isFirstOwnerClaimOpen(state)) {
    throw redirect("/login");
  }

  return typedjson({}, { headers: { "Cache-Control": "no-store" } });
}

export async function action({ request }: ActionFunctionArgs) {
  const state = await getFirstOwnerState();
  if (!state.isSelfHosted || !isFirstOwnerClaimOpen(state)) {
    throw redirect("/login");
  }

  if (!isSameOriginSetupRequest(request)) {
    return typedjson<ActionData>(
      { error: "Open this page directly from your Flowcordia installation and try again." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const clientIp =
    extractClientIp(request.headers.get("x-forwarded-for")) ??
    request.headers.get("cf-connecting-ip") ??
    "unknown";

  try {
    await checkFirstOwnerRateLimit(clientIp);
  } catch (error) {
    if (error instanceof FirstOwnerRateLimitError) {
      return typedjson<ActionData>(
        { error: "Too many account-creation attempts. Wait a few minutes and try again." },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    }

    logger.error("Flowcordia first-owner rate limiter failed", { error, clientIp });
    return typedjson<ActionData>(
      {
        error:
          "Administrator creation is temporarily unavailable because Redis could not be reached. Check Redis and retry.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const parsed = FirstOwnerSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return typedjson<ActionData>(
      {
        error: "Check the account details and try again.",
        fieldErrors: {
          email: flattened.email?.[0],
          name: flattened.name?.[0],
          password: flattened.password?.[0],
          confirmPassword: flattened.confirmPassword?.[0],
        },
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const user = await claimFirstOwner({
      email: parsed.data.email,
      name: parsed.data.name,
      password: parsed.data.password,
    });

    await postAuthentication({
      user,
      isNewUser: true,
      loginMethod: user.authenticationMethod,
    });

    let nextPath = "/setup/first-run";
    try {
      await ensureSelfHostFirstRunTarget(user.id);
    } catch (error) {
      logger.error("Flowcordia automatic first workspace creation failed", {
        error,
        userId: user.id,
      });
      nextPath = "/setup?advanced=1&recovery=workspace";
    }

    const session = await getUserSession(request);
    session.set(authenticator.sessionKey, { userId: user.id });
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", await commitAuthenticatedSession(session, user.id));
    headers.append("Set-Cookie", await setLastAuthMethodHeader("password"));

    return redirect(nextPath, { headers });
  } catch (error) {
    if (error instanceof FirstOwnerClaimError) {
      if (error.code === "already-claimed") {
        throw redirect("/login");
      }

      return typedjson<ActionData>(
        { error: error.message },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    logger.error("Flowcordia first-owner claim failed", { error });
    return typedjson<ActionData>(
      {
        error:
          "Flowcordia could not create the first administrator. Check the server logs and retry.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export default function FirstOwnerSetupPage() {
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <LoginPageLayout>
      <Form method="post" className="w-full">
        <div className="flex w-full flex-col items-center justify-center">
          <Header1 className="pb-3 text-center font-semibold sm:text-2xl md:text-3xl lg:text-4xl">
            Welcome to Flowcordia
          </Header1>
          <Paragraph variant="base" className="mb-6 text-center">
            Create the administrator account for this installation. Your workspace will be prepared
            automatically.
          </Paragraph>

          <Fieldset className="flex w-full flex-col items-center gap-y-3">
            <InputGroup fullWidth>
              <Input
                name="name"
                autoComplete="name"
                placeholder="Your name"
                variant="large"
                maxLength={80}
                autoFocus
              />
              {actionData?.fieldErrors?.name && (
                <FormError>{actionData.fieldErrors.name}</FormError>
              )}
            </InputGroup>

            <InputGroup fullWidth>
              <Input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="Administrator email"
                variant="large"
                spellCheck={false}
                required
              />
              {actionData?.fieldErrors?.email && (
                <FormError>{actionData.fieldErrors.email}</FormError>
              )}
            </InputGroup>

            <InputGroup fullWidth>
              <Input
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="Password"
                variant="large"
                minLength={15}
                maxLength={128}
                required
              />
              {actionData?.fieldErrors?.password && (
                <FormError>{actionData.fieldErrors.password}</FormError>
              )}
            </InputGroup>

            <InputGroup fullWidth>
              <Input
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
                variant="large"
                minLength={15}
                maxLength={128}
                required
              />
              {actionData?.fieldErrors?.confirmPassword && (
                <FormError>{actionData.fieldErrors.confirmPassword}</FormError>
              )}
            </InputGroup>

            <Paragraph variant="extra-small" className="w-full text-left text-text-dimmed">
              Use at least 15 characters. Passphrases and spaces are supported.
            </Paragraph>

            {actionData?.error && <FormError>{actionData.error}</FormError>}

            <Button
              type="submit"
              variant="primary/large"
              disabled={isSubmitting}
              fullWidth
              data-action="create flowcordia administrator"
            >
              {isSubmitting ? (
                <Spinner className="mr-2 size-5" color="white" />
              ) : (
                <LockClosedIcon className="mr-2 size-5 text-text-bright" />
              )}
              <span className="text-text-bright">
                {isSubmitting ? "Preparing Flowcordia…" : "Create administrator"}
              </span>
            </Button>
          </Fieldset>

          <div className="mt-5 flex items-start gap-2 rounded-lg border border-grid-bright bg-background-dimmed px-3 py-2.5">
            <LockClosedIcon className="mt-0.5 size-4 shrink-0 text-text-dimmed" />
            <Paragraph variant="extra-small" className="text-text-dimmed">
              This page closes permanently after the first administrator is created.
            </Paragraph>
          </div>
        </div>
      </Form>
    </LoginPageLayout>
  );
}
