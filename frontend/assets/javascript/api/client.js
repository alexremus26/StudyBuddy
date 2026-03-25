import createClient from 'openapi-fetch';

const TOKEN_STORAGE_KEY = 'studybuddy_token';

export function getAuthToken() {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token) {
  if (!token) {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

function toApiError(error, response) {
  const status = response?.status ?? 500;
  if (typeof error === 'string') {
    return new Error(`API ${status}: ${error}`);
  }

  try {
    return new Error(`API ${status}: ${JSON.stringify(error)}`);
  } catch {
    return new Error(`API ${status}: Request failed`);
  }
}

async function postJson(url, payload) {
  const token = getAuthToken();
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiError(data ?? 'Request failed', response);
  }
  return data;
}

const apiClient = createClient({
  baseUrl: '',
  fetch: async (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    headers.set('Accept', 'application/json');

    const contentType = headers.get('Content-Type');
    const hasEmptyContentType = contentType != null && contentType.trim() === '';
    const isFormDataBody = typeof FormData !== 'undefined' && init.body instanceof FormData;

    if (init.body != null && !isFormDataBody && (!contentType || hasEmptyContentType)) {
      headers.set('Content-Type', 'application/json');
    }

    const token = getAuthToken();
    if (token) {
      headers.set('Authorization', `Token ${token}`);
    }

    return fetch(input, {
      ...init,
      credentials: 'omit',
      headers,
    });
  },
});

export async function registerUser(payload) {
  return postJson('/api/register/', payload);
}

export async function loginUser(payload) {
  return postJson('/api/login/', payload);
}

export async function getMe() {
  const { data, error, response } = await apiClient.GET('/me/');
  if (error) {
    throw toApiError(error, response);
  }
  return data;
}

export async function listTasks() {
  const { data, error, response } = await apiClient.GET('/api/schedule/tasks/');
  if (error) {
    throw toApiError(error, response);
  }
  return data;
}

export async function createTask(payload) {
  const { data, error, response } = await apiClient.POST('/api/schedule/tasks/', {
    body: payload,
  });
  if (error) {
    throw toApiError(error, response);
  }
  return data;
}
