# Phase 2A API contract

Auth clients call Supabase Auth only: signUp, signInWithPassword, signOut (local session), resetPasswordForEmail, updateUser during recovery, getSession/getUser and onAuthStateChange. PKCE callbacks use `/auth/callback` on web and `minierp://auth/callback` on Android. Email confirmation may produce no session; the client shows verification-required without inventing delivery or tenant creation.

Public client variables are `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` and `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Privileged keys/passwords are never accepted as client config. Ignored per-app env files target authorized hosted DEV `jujwnhwrktmimtcnljsd` (mini erp dev). No Express server, production or app deployment exists. Hosted Auth/Data API/RPC are available without local Docker.

## Data API (hosted DEV verified)

- profiles: read self; update own display_name/phone/preferred_language only.
- businesses: active members read; OWNER updates name/phone/address only. No client insert/delete or created_by changes.
- business_members: active members read their tenant; OWNER inserts existing Auth users as STAFF or changes Staff status. No role/identity/business reassignment, Owner-row mutation or deletion.
- business_member_permissions: Owner inserts/deletes allowlisted grants on own Staff; Staff reads own grants. No self-escalation.
- business_settings: active members read; OWNER updates default_language only. Currency, timezone and negative-stock default are fixed in Phase 2A.

The client fetches its own ACTIVE memberships, then RLS-allowed business/settings/permission rows. Zero memberships means onboarding; one selects automatically; multiple present an explicit selector. No locally stored business ID authorizes access.

## Atomic onboarding RPC

`create_initial_business(p_request_id uuid, p_business_name text, p_display_name text default '', p_phone text default null, p_address text default null) -> uuid`

Authenticated only. Identity is auth.uid(), never a caller-supplied user/creator ID. Ensures/updates own profile display name, creates business + OWNER membership + default settings in one database transaction. A required-step failure rolls back. A per-user transaction lock and unique (created_by,onboarding_key) protect duplicate requests; same key/business input returns the original ID. Mismatched business input rejects. A different key cannot repeat initial onboarding for a user with active membership; reload membership instead. Schema supports multiple businesses/memberships, but deliberate additional-business creation and ownership transfer are later flows.

Business/name/contact length limits, role/status/language/fixed Bangladesh defaults, foreign keys and uniqueness are database constrained. Posted finance is absent; no financial RPC is implemented. See phase2a.md and permissions.md for exact security/testing status.

Verification on 19 October 2026: migration history matches; hosted lint PASS; 55/55 database assertions PASS, zero failures. Web signup (approved temporary DEV confirmation-OFF), login, onboarding, reload, language and logout passed. Confirmation is restored ON. Confirmation-required signup/callback and password-reset completion remain live-unverified because hosted mail quota returned HTTP 429; recovery error handling was observed without a delivery claim. Exact callbacks and fixture cleanup evidence are in phase2a.md. Hosted tests do not prove a local clean reset or Android runtime.
