import { ArrowLeftIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useActionData, useNavigation } from "@remix-run/react";
import { typedjson } from "remix-typedjson";
import { z } from "zod";
import { LoginPageLayout } from "~/components/LoginPageLayout";
import { Button, LinkButton } from "~/components/primitives/Buttons";
import { Fieldset } from "~/components/primitives/Fieldset";
import { FormError } from "~/components/primitives/FormError";
import { Header1 } from "~/components/primitives/Headers";
import { Input } from "~/components/primitives/Input";
import { InputGroup } from "~/components/primitives/InputGroup";
import { Paragraph } from "~/components/primitives/Paragraph";
import { Spinner } from "~/components/primitives/Spinner";
import { env } from "~/env.server";
import { featuresForRequest } from "~/features.server";
import { authenticateAdminPassword } from "~/services/passwordAuth.server";
import {
  checkPasswordEmailRateLimit,
  checkPasswordIpRateLimit,
  PasswordRateLimitError,
} from "~/services/passwordRateLimiter.server";
import { authenticator } from "~/services/auth.server";
import { setLastAuthMethodHeader } from "~/services/lastAuthMethod.server";
import {
  commitSession as commitRedirectSession,
  getRedirectTo,
  setRedirectTo,
} from "~/services/redirectTo.server";
import { commitSession, getUserSession } from "~/services/sessionStorage.server";
import { commitAuthenticatedSession } from "~/services/sessionDuration.server";
import { trackAndClearReferralSource } from "~/services/referralSource.server";
import { logger } from "~/services/logger.server";
import { extractClientIp } from "~/utils/extractClientIp.server";
import { sanitizeRedirectPath } from "~/utils";

const PasswordLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

type ActionData = { error?: string };

export const meta: MetaFunction = () => [{ title: "Sign in with password | Flowcordia" }];

function requireSelfHosted(request: Request) {
  if (featuresForRequest(request).isManagedCloud) {
    throw redirect("/login");
  }
}

function postLoginRedirect(path: string | undefined | null): string {
  const sanitized = sanitizeRedirectPath(path);
  const pathname = new URL(sanitized, "https://flowcordia.local").pathname;
  return pathname === "/login/password" ? "/" : sanitized;
}

export async function loader({ request }: LoaderFunctionArgs) {
  requireSelfHosted(request);
  await authenticator.isAuthenticated(request, { successRedirect: "/" });

  const url = new URL(request.url);
  const redirectTo = postLoginRedirect(url.searchParams.get("redirectTo"));
  if (redirectTo !== "/") {
    const redirectSession = await setRedirectTo(request, redirectTo);
    return typedjson(
      {},
      { headers: { "Set-Cookie": await commitRedirectSession(redirectSession) } }
    );
  }

  return typedjson({});
}

export async function action({ request }: ActionFunctionArgs) {
  requireSelfHosted(request);

  const parsed = PasswordLoginSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    return typedjson<ActionData>({ error: "Invalid email or password." }, { status: 400 });
  }

  const { email, password } = parsed.data;
  if (env.LOGIN_RATE_LIMITS_ENABLED) {
    const clientIp = extractClientIp(request.headers.get("x-forwarded-for"));
    try {
      await Promise.all([
        checkPasswordEmailRateLimit(email),
        clientIp ? checkPasswordIpRateLimit(clientIp) : Promise.resolve(),
      ]);
    } catch (error) {
      if (error instanceof PasswordRateLimitError) {
        logger.warn("Local administrator password login rate limit exceeded", {
          email,
          clientIp,
        });
      } else {
        logger.error("Local administrator password rate limiter failed", { error, clientIp });
      }

      return typedjson<ActionData>(
        { error: "Too many sign-in attempts. Please try again shortly." },
        { status: 429 }
      );
    }
  }

  const user = await authenticateAdminPassword(email, password);
  if (!user) {
    return typedjson<ActionData>({ error: "Invalid email or password." }, { status: 400 });
  }

  const redirectTo = postLoginRedirect(await getRedirectTo(request));
  const session = await getUserSession(request);
  const headers = new Headers();

  if (user.mfaEnabledAt) {
    session.set("pending-mfa-user-id", user.id);
    session.set("pending-mfa-redirect-to", redirectTo);
    session.unset("pending-sso");
    headers.append("Set-Cookie", await commitSession(session));
    headers.append("Set-Cookie", await setLastAuthMethodHeader("password"));
    return redirect("/login/mfa", { headers });
  }

  session.set(authenticator.sessionKey, { userId: user.id });
  headers.append("Set-Cookie", await commitAuthenticatedSession(session, user.id));
  headers.append("Set-Cookie", await setLastAuthMethodHeader("password"));
  await trackAndClearReferralSource(request, user.id, headers);

  return redirect(redirectTo, { headers });
}

export default function PasswordLoginPage() {
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  return (
    <LoginPageLayout>
      <Form method="post">
        <div className="flex flex-col items-center justify-center">
          <Header1 className="pb-4 font-semibold sm:text-2xl md:text-3xl lg:text-4xl">
            Administrator sign in
          </Header1>
          <Paragraph variant="base" className="mb-6 text-center">
            Sign in to this self-hosted Flowcordia installation.
          </Paragraph>
          <Fieldset className="flex w-full flex-col items-center gap-y-3">
            <InputGroup fullWidth>
              <Input
                type="email"
                name="email"
                spellCheck={false}
                autoComplete="email"
                placeholder="Email address"
                variant="large"
                required
                autoFocus
              />
            </InputGroup>
            <InputGroup fullWidth>
              <Input
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="Password"
                variant="large"
                required
                maxLength={128}
              />
            </InputGroup>
            <Button
              type="submit"
              variant="primary/large"
              disabled={isLoading}
              fullWidth
              data-action="sign in with password"
            >
              {isLoading ? (
                <Spinner className="mr-2 size-5" color="white" />
              ) : (
                <LockClosedIcon className="mr-2 size-5 text-text-bright" />
              )}
              <span className="text-text-bright">{isLoading ? "Signing in…" : "Sign in"}</span>
            </Button>
            {actionData?.error && <FormError>{actionData.error}</FormError>}
          </Fieldset>
          <LinkButton
            to="/login"
            variant="minimal/small"
            LeadingIcon={ArrowLeftIcon}
            leadingIconClassName="text-text-dimmed group-hover:text-text-bright transition"
            className="mt-6"
          >
            All login options
          </LinkButton>
        </div>
      </Form>
    </LoginPageLayout>
  );
}
