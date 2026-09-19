import { redirect } from "react-router-dom";
import { ApiError, createClient } from "../api/client";
import { createEndpoints } from "../api/endpoints";
import { appStore } from "../store";
import type { LoginInput, SignupInput } from "../types";

/** User-facing copy, from docs/state-matrix.md § S1 and § S2. */
export const COPY = {
  invalidEmail: "Enter a valid email address.",
  shortPassword: "Password must be at least 8 characters.",
  nameRequired: "Enter your name.",
  passwordMismatch: "Passwords don't match.",
  badCredentials: "We couldn't sign you in. Check your email and password, then try again.",
  emailTaken: "That email is already registered. Sign in instead, or use a different address.",
  network: "Couldn't reach the server. Check your connection and try again.",
  server: "Something went wrong on our side. Wait a moment, then try again.",
} as const;

export const MIN_PASSWORD_LENGTH = 8;

// ------------------------------------------------------------- validation

export interface SignUpValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignIn(values: LoginInput): FieldErrors<LoginInput> {
  const errors: FieldErrors<LoginInput> = {};
  if (!EMAIL.test(values.email.trim())) errors.email = COPY.invalidEmail;
  if (values.password.length < MIN_PASSWORD_LENGTH) errors.password = COPY.shortPassword;
  return errors;
}

/** Keys come back in form order, so the first one is the field to focus. */
export function validateSignUp(values: SignUpValues): FieldErrors<SignUpValues> {
  const errors: FieldErrors<SignUpValues> = {};
  if (!values.name.trim()) errors.name = COPY.nameRequired;
  if (!EMAIL.test(values.email.trim())) errors.email = COPY.invalidEmail;
  if (values.password.length < MIN_PASSWORD_LENGTH) errors.password = COPY.shortPassword;
  if (values.confirmPassword !== values.password) errors.confirmPassword = COPY.passwordMismatch;
  return errors;
}

// ------------------------------------------------------------- form errors

export type FormErrorKind = "rejected" | "email-taken" | "network" | "server";

export interface FormError {
  message: string;
  kind: FormErrorKind;
}

/**
 * Maps an API failure to form-level copy. The API's `message` is never shown:
 * the state matrix owns the wording, and a server fault never reads like a typo.
 */
export function formErrorFor(error: ApiError, form: "signin" | "signup"): FormError {
  switch (error.code) {
    case "network_error":
      return { message: COPY.network, kind: "network" };
    case "email_taken":
      return { message: COPY.emailTaken, kind: "email-taken" };
    case "bad_credentials":
      return { message: COPY.badCredentials, kind: "rejected" };
    case "invalid_email":
      return { message: COPY.invalidEmail, kind: "rejected" };
    case "weak_password":
      return { message: COPY.shortPassword, kind: "rejected" };
  }
  if (error.status >= 500 || error.status === 0) return { message: COPY.server, kind: "server" };
  return { message: form === "signin" ? COPY.badCredentials : COPY.server, kind: "rejected" };
}

// ------------------------------------------------------------- requests

// Sign-in happens before there is a token, so it uses its own unauthenticated client.
const authApi = createEndpoints(
  createClient({
    baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:4000",
    getToken: () => null,
    onUnauthorized: () => {},
  }),
).auth;

function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, "client_error", COPY.server);
}

/** Signs in and starts the session. The password is sent once and kept nowhere. */
export async function signIn(values: LoginInput): Promise<void> {
  try {
    const result = await authApi.login({ email: values.email.trim(), password: values.password });
    appStore.getState().signIn(result);
  } catch (error) {
    throw asApiError(error);
  }
}

export async function signUp(values: SignUpValues): Promise<void> {
  const input: SignupInput = { name: values.name.trim(), email: values.email.trim(), password: values.password };
  try {
    const result = await authApi.signup(input);
    appStore.getState().signIn(result);
  } catch (error) {
    throw asApiError(error);
  }
}

// ------------------------------------------------------------- route guards

// Loaders run before the route renders, so a redirect lands before first paint.

export function requireSession(): Response | null {
  return appStore.getState().token ? null : redirect("/signin");
}

export function redirectIfSignedIn(): Response | null {
  return appStore.getState().token ? redirect("/") : null;
}
