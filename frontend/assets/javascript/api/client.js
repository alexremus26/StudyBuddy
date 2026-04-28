import createClient from 'openapi-fetch';

const TOKEN_STORAGE_KEY = 'studybuddy_token';
const AUTH_INVALID_EVENT = 'studybuddy:auth-invalid-token';

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

function hasInvalidTokenDetail(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const detail = error.detail;
  return typeof detail === 'string' && detail.trim().toLowerCase() === 'invalid token.';
}

function handleInvalidToken(error, response) {
  if (response?.status !== 401 || !hasInvalidTokenDetail(error)) {
    return;
  }

  setAuthToken(null);
  window.dispatchEvent(new CustomEvent(AUTH_INVALID_EVENT));
}

function isFormData(value) {
  return typeof FormData !== 'undefined' && value instanceof FormData;
}

export function onInvalidAuthToken(callback) {
  window.addEventListener(AUTH_INVALID_EVENT, callback);
  return () => window.removeEventListener(AUTH_INVALID_EVENT, callback);
}

function toApiError(error, response) {
  handleInvalidToken(error, response);
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
  const isMultipart = isFormData(payload);
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: isMultipart ? payload : JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiError(data ?? 'Request failed', response);
  }
  return data;
}

async function patchJson(url, payload) {
  const token = getAuthToken();
  const isMultipart = isFormData(payload);
  const response = await fetch(url, {
    method: 'PATCH',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: isMultipart ? payload : JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiError(data ?? 'Request failed', response);
  }
  return data;
}

async function putJson(url, payload) {
  const token = getAuthToken();
  const isMultipart = isFormData(payload);
  const response = await fetch(url, {
    method: 'PUT',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
    body: isMultipart ? payload : JSON.stringify(payload),
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

export async function listAssignments() {
  const { data, error, response } = await apiClient.GET('/api/schedule/assignments/');
  if (error) {
    throw toApiError(error, response);
  }
  return data;
}

export async function createAssignment(payload) {
  return postJson('/api/schedule/assignments/', payload);
}

export async function parseScheduleText(payload) {
  return postJson('/api/schedule/parse-text/', payload);
}

export async function getAssignment(assignmentId) {
  const { data, error, response } = await apiClient.GET('/api/schedule/assignments/{id}/', {
    params: { path: { id: assignmentId } },
  });
  if (error) {
    throw toApiError(error, response);
  }
  return data;
}

export async function updateAssignment(assignmentId, payload) {
  return patchJson(`/api/schedule/assignments/${assignmentId}/`, payload);
}

export async function deleteAssignment(assignmentId) {
  return deleteJson(`/api/schedule/assignments/${assignmentId}/`);
}

export async function deleteAllAssignments() {
  const token = getAuthToken();
  const response = await fetch('/api/schedule/assignments/delete-all/', {
    method: 'DELETE',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiError(data ?? 'Request failed', response);
  }
  return data;
}

export async function listSchoolClasses() {
  const { data, error, response } = await apiClient.GET('/api/schedule/school-classes/');
  if (error) {
    throw toApiError(error, response);
  }
  return data;
}

export async function createSchoolClass(payload) {
  return postJson('/api/schedule/school-classes/', payload);
}

export async function updateSchoolClass(schoolClassId, payload) {
  return patchJson(`/api/schedule/school-classes/${schoolClassId}/`, payload);
}

export async function deleteSchoolClass(schoolClassId) {
  return deleteJson(`/api/schedule/school-classes/${schoolClassId}/`);
}

export async function deleteAllSchoolClasses() {
  const token = getAuthToken();
  const response = await fetch('/api/schedule/school-classes/delete-all/', {
    method: 'DELETE',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiError(data ?? 'Request failed', response);
  }
  return data;
}

export async function listTaskBlocks() {
  const { data, error, response } = await apiClient.GET('/api/schedule/task-blocks/');
  if (error) {
    throw toApiError(error, response);
  }
  return data;
}

export async function listCafeLocations() {
  const { data, error, response } = await apiClient.GET('/api/coffeeshops/locations/');
  if (error) {
    throw toApiError(error, response);
  }
  return data;
}

export async function createTaskBlock(payload) {
  return postJson('/api/schedule/task-blocks/', payload);
}

export async function deleteTaskBlock(taskBlockId) {
  return deleteJson(`/api/schedule/task-blocks/${taskBlockId}/`);
}

export async function deleteAllTaskBlocks() {
  const token = getAuthToken();
  const response = await fetch('/api/schedule/task-blocks/delete-all/', {
    method: 'DELETE',
    credentials: 'omit',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Token ${token}` } : {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw toApiError(data ?? 'Request failed', response);
  }
  return data;
}

export async function updateMyProfile(payload) {
  return putJson('/me/profile/', payload);
}

export async function generatePlan(payload) {
  return postJson('/api/schedule/planner/generate/', payload);
}

export async function listPlanDrafts() {
  const { data, error, response } = await apiClient.GET('/api/schedule/planner/drafts/');
  if (error) {
    throw toApiError(error, response);
  }
  return data;
}

export async function approvePlan(planId) {
  return postJson(`/api/schedule/planner/approve/${planId}/`, {});
}

export async function deletePlan(planId) {
  return deleteJson(`/api/schedule/planner/delete/${planId}/`);
}
