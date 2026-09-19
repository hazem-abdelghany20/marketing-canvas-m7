import { Check } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthCard, FormAlert, SubmitButton, SUCCESS_BEAT_MS } from "../components/AuthCard";
import { Field } from "../components/Field";
import { formErrorFor, signIn, validateSignIn, type FieldErrors, type FormError, returnPath } from "../auth/session";
import type { ApiError } from "../api/client";
import type { LoginInput } from "../types";

type Status = "idle" | "pending" | "success";

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState<LoginInput>({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<LoginInput>>({});
  const [formError, setFormError] = useState<FormError | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const refs = { email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };

  useEffect(() => {
    refs.email.current?.focus(); // once, on arrival
  }, []);

  function edit(field: keyof LoginInput, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (status !== "idle") return;

    const found = validateSignIn(values);
    const first = (Object.keys(found) as (keyof LoginInput)[])[0];
    if (first) {
      setErrors(found);
      refs[first].current?.focus();
      return;
    }

    setFormError(null);
    setStatus("pending");
    try {
      await signIn(values);
      setStatus("success");
      setTimeout(() => navigate(returnPath(location.search), { replace: true }), SUCCESS_BEAT_MS);
    } catch (error) {
      setFormError(formErrorFor(error as ApiError, "signin"));
      setStatus("idle");
    }
  }

  const locked = status !== "idle";

  return (
    <AuthCard
      heading="Sign in"
      subheading="Pick up your board where you left it."
      footer={
        <>
          No account?{" "}
          <Link to="/signup" className="font-semibold underline underline-offset-2">
            Create one
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {formError ? <FormAlert error={formError} onRetry={() => void submit()} /> : null}
        <Field
          ref={refs.email}
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@studio.com"
          value={values.email}
          onChange={(e) => edit("email", e.target.value)}
          readOnly={locked}
          error={errors.email}
        />
        <Field
          ref={refs.password}
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="At least 8 characters"
          value={values.password}
          onChange={(e) => edit("password", e.target.value)}
          readOnly={locked}
          error={errors.password}
        />
        <SubmitButton status={status}>
          {status === "pending" ? (
            "Signing in…"
          ) : status === "success" ? (
            <Check aria-label="Signed in" size={18} />
          ) : (
            "Sign in"
          )}
        </SubmitButton>
      </form>
    </AuthCard>
  );
}
