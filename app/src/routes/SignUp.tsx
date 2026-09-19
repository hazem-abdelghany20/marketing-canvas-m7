import { Check } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthCard, FormAlert, SubmitButton, SUCCESS_BEAT_MS } from "../components/AuthCard";
import { Field } from "../components/Field";
import {
  formErrorFor,
  MIN_PASSWORD_LENGTH,
  signUp,
  validateSignUp,
  type FieldErrors,
  type FormError,
  type SignUpValues,
  returnPath,
} from "../auth/session";
import type { ApiError } from "../api/client";

type Status = "idle" | "pending" | "success";

const EMPTY: SignUpValues = { name: "", email: "", password: "", confirmPassword: "" };

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState<SignUpValues>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<SignUpValues>>({});
  const [formError, setFormError] = useState<FormError | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const refs = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirmPassword: useRef<HTMLInputElement>(null),
  };

  function edit(field: keyof SignUpValues, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (status !== "idle") return;

    const found = validateSignUp(values);
    const first = (Object.keys(found) as (keyof SignUpValues)[])[0];
    if (first) {
      setErrors(found);
      refs[first].current?.focus();
      return;
    }

    setFormError(null);
    setStatus("pending");
    try {
      await signUp(values);
      setStatus("success");
      setTimeout(() => navigate(returnPath(location.search), { replace: true }), SUCCESS_BEAT_MS);
    } catch (error) {
      setFormError(formErrorFor(error as ApiError, "signup"));
      // Every value is kept except the passwords.
      setValues((v) => ({ ...v, password: "", confirmPassword: "" }));
      setStatus("idle");
    }
  }

  const locked = status !== "idle";
  const ruleMet = values.password.length >= MIN_PASSWORD_LENGTH;
  const confirmHint =
    values.confirmPassword === "" ? undefined : values.confirmPassword === values.password ? (
      <Rule met>Passwords match</Rule>
    ) : (
      <Rule met={false}>Doesn't match yet</Rule>
    );

  return (
    <AuthCard
      heading="Create your workspace"
      subheading="One board, six kinds of node, and the lines that say why anything exists."
      footer={
        <>
          Already have a workspace?{" "}
          <Link to="/signin" className="font-semibold underline underline-offset-2">
            Sign in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {formError ? <FormAlert error={formError} onRetry={() => void submit()} /> : null}
        <Field
          ref={refs.name}
          label="Name"
          autoComplete="name"
          placeholder="Your name"
          value={values.name}
          onChange={(e) => edit("name", e.target.value)}
          disabled={locked}
          error={errors.name}
          autoFocus
        />
        <Field
          ref={refs.email}
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@studio.com"
          value={values.email}
          onChange={(e) => edit("email", e.target.value)}
          disabled={locked}
          error={errors.email}
        />
        <Field
          ref={refs.password}
          label="Password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={values.password}
          onChange={(e) => edit("password", e.target.value)}
          disabled={locked}
          error={errors.password}
          hint={<Rule met={ruleMet}>At least {MIN_PASSWORD_LENGTH} characters</Rule>}
        />
        <Field
          ref={refs.confirmPassword}
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat it"
          value={values.confirmPassword}
          onChange={(e) => edit("confirmPassword", e.target.value)}
          disabled={locked}
          error={errors.confirmPassword}
          hint={confirmHint}
        />
        <SubmitButton status={status}>
          {status === "pending" ? (
            "Creating…"
          ) : status === "success" ? (
            <Check aria-label="Created" size={18} />
          ) : (
            "Create workspace"
          )}
        </SubmitButton>
      </form>
    </AuthCard>
  );
}

/** Guidance that turns green once satisfied. Muted, never red: it is not an error. */
function Rule({ met, children }: { met: boolean; children: ReactNode }) {
  return (
    <span data-met={met} className={`inline-flex items-center gap-1 ${met ? "text-ok" : "text-muted"}`}>
      {met ? <Check aria-hidden="true" size={12} /> : null}
      {children}
    </span>
  );
}
