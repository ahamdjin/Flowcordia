import { LockClosedIcon, ShieldCheckIcon } from "@heroicons/react/20/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { typedjson, useTypedLoaderData } from "remix-typedjson";
import { z } from "zod";
import { LoginPageLayout } from "~/components/LoginPageLayout";
import { Button } from "~/components/primitives/Buttons";
import { Fieldset } from "~/components/primitives/Fieldset";
import { FormError } from "~/components/primitives/FormError";
import { Header1 } from "~/components/primitives/Headers";
import { Input } from "~/components/primitives/Input";
import { InputGroup } from "~/components/primitives/InputGroup";
import { Label } from "~/components/primitives/Label";
import { Paragraph } from "~/components/primitives/Paragraph";
import { Spinner } from "~/components/primitives/Spinner";
import {
  claimFirstOwner,
  FirstOwnerClaimError,
  getFirstOwnerState,
} from "~/features/flowcordia/setup/firstOwner.server";
import {
  checkFirstOwnerRateLimit,
  FirstOwnerRateLimitError,
} from "~/features/flowcordia/setup/firstOwnerRateLimiter.server";
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
    setupToken: z.string().trim().min(1, "Enter the setup token."),
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

export const meta: MetaFunction = () => [{ title: "Claim this Flowcordia installation" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const state = await getFirstOwnerState();
  if (!state.isSelfHosted) {
    throw redirect("/login");
  }
  if (state.claimed) {
    throw redirect("/login");
  }

  return typedjson(
    { setupTokenConfigured: state.setupTokenConfigured },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const state = await getFirstOwnerState();
  if (!state.isSelfHosted) {
    throw redirect("/login");
  }
  if (state.claimed) {
    throw redirect("/login");
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
        { error: "Too many setup attempts. Wait a few minutes and try again." },
        { status: 429, headers: { "Cache-Control": "no-store" } }
      );
    }

    logger.error("Flowcordia first-owner rate limiter failed", { error, clientIp });
    return typedjson<ActionData>(
      {
        error:
          "Setup verification is temporarily unavailable because Redis could not be reached. Check the Redis connection and retry.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const parsed = FirstOwnerSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;
    return typedjson<ActionData>(
      {
        error: "Check the setup fields and try again.",
        fieldErrors: {
          setupToken: flattened.setupToken?.[0],
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
      setupToken: parsed.data.setupToken,
      email: parsed.data.email,
      name: parsed.data.name,
      password: parsed.data.password,
    });

    await postAuthentication({
      user,
      isNewUser: true,
      loginMethod: user.authenticationMethod,
    });

    const session = await getUserSession(request);
    session.set(authenticator.sessionKey, { userId: user.id });
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", await commitAuthenticatedSession(session, user.id));
    headers.append("Set-Cookie", await setLastAuthMethodHeader("password"));

    return redirect("/setup", { headers });
  } catch (error) {
    if (error instanceof FirstOwnerClaimError) {
      if (error.code === "already-claimed") {
        throw redirect("/login");
      }

      const status = error.code === "token-not-configured" ? 503 : 400;
      return typedjson<ActionData>(
        {
          error: error.message,
          fieldErrors: error.code === "invalid-token" ? { setupToken: error.message } : undefined,
        },
        { status, headers: { "Cache-Control": "no-store" } }
      );
    }

    logger.error("Flowcordia first-owner claim failed", { error });
    return typedjson<ActionData>(
      { error: "Flowcordia could not create the first administrator. Check the server logs and retry." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export default function FirstOwnerSetupPage() {
  const { setupTokenConfigured } = useTypedLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <LoginPageLayout>
      <div className="flex w-full max-w-lg flex-col items-center">
        <div className="mb-5 grid size-12 place-items-center rounded-full border border-grid-bright bg-background-bright">
          <ShieldCheckIcon className="size-6 text-indigo-300" />
        </div>
        <Header1 className="pb-3 text-center font-semibold sm:text-2xl md:text-3xl">
          Claim this Flowcordia installation
        </Header1>
        <Paragraph variant="base" className="mb-6 text-center">
          Create the first platform administrator. This page closes permanently after the claim
          succeeds.
        </Paragraph>

        {!setupTokenConfigured ? (
          <div className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="font-medium text-amber-200">Setup token required</p>
            <p className="mt-2 text-sm leading-6 text-amber-100/80">
              Set <code>FLOWCORDIA_SETUP_TOKEN</code> to a random value of at least 32 characters,
              restart the web application, then reload this page. Keep that token private.
            </p>
          </div>
        ) : (
          <Form method="post" className="w-full">
            <Fieldset className="flex w-full flex-col gap-4">
              <InputGroup fullWidth>
                <Label htmlFor="setupToken">One-time setup token</Label>
                <Input
                  id="setupToken"
                  name="setupToken"
                  type="password"
                  autoComplete="off"
                  required
                  autoFocus
                />
                {actionData?.fieldErrors?.setupToken && (
                  <FormError>{actionData.fieldErrors.setupToken}</FormError>
                )}
              </InputGroup>

              <InputGroup fullWidth>
                <Label htmlFor="name">Administrator name</Label>
                <Input id="name" name="name" autoComplete="name" maxLength={80} />
                {actionData?.fieldErrors?.name && (
                  <FormError>{actionData.fieldErrors.name}</FormError>
                )}
              </InputGroup>

              <InputGroup fullWidth>
                <Label htmlFor="email">Administrator email</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
                {actionData?.fieldErrors?.email && (
                  <FormError>{actionData.fieldErrors.email}</FormError>
                )}
              </InputGroup>

              <InputGroup fullWidth>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={15}
                  maxLength={128}
                  required
                />
                <Paragraph variant="extra-small" className="mt-1 text-text-dimmed">
                  Use at least 15 characters. Passphrases and spaces are supported.
                </Paragraph>
                {actionData?.fieldErrors?.password && (
                  <FormError>{actionData.fieldErrors.password}</FormError>
                )}
              </InputGroup>

              <InputGroup fullWidth>
                <Label htmlFor="confirmPassword">Confirm password</Label>
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

              <Button
                type="submit"
                variant="primary/large"
                disabled={isSubmitting}
                fullWidth
                data-action="claim flowcordia installation"
              >
                {isSubmitting ? (
                  <Spinner className="mr-2 size-5" color="white" />
                ) : (
                  <LockClosedIcon className="mr-2 size-5 text-text-bright" />
                )}
                <span className="text-text-bright">
                  {isSubmitting ? "Creating administrator…" : "Create administrator"}
                </span>
              </Button>
            </Fieldset>
          </Form>
        )}
      </div>
    </LoginPageLayout>
  );
}
