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

async function patchJson(url, payload) {
  const token = getAuthToken();
  const response = await fetch(url, {
    method: 'PATCH',
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

async function deleteJson(url) {
  const token = getAuthToken();
  const response = await fetch(url, {
    method: 'DELETE',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw toApiError(data ?? 'Request failed', response);
  }
  return true;
}

const apiClient = createClient({
  baseUrl: '',
  fetch: async (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    headers.set('Accept', 'application/json');

    if (init.body != null) {
      const currentContentType = headers.get('Content-Type');
      if (!currentContentType || currentContentType.trim() === '') {
        headers.set('Content-Type', 'application/json');
      }
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
  return postJson('/api/schedule/tasks/', payload);
}

export async function getTask(taskId) {
  const { data, error, response } = await apiClient.GET('/api/schedule/tasks/{id}/', {
    params: { path: { id: taskId } },
  });
  if (error) {
    throw toApiError(error, response);
  }
  return data;
}

export async function updateTask(taskId, payload) {
  return patchJson(`/api/schedule/tasks/${taskId}/`, payload);
}

export async function deleteTask(taskId) {
  return deleteJson(`/api/schedule/tasks/${taskId}/`);
}
