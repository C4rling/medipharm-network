const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// TEMPORARY: dev headers until real login exists (the API needs ALLOW_DEV_AUTH=true).
const devHeaders = {
  'x-dev-role': 'staff',
  'x-dev-user-id': '2',
};

export async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...devHeaders, ...options.headers },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}