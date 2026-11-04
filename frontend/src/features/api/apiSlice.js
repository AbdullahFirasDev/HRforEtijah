import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { logout, SESSION_EXPIRED_NOTICE } from '../auth/authSlice';
import { getDeviceId } from '../../utils/deviceId';

// Same-origin by default: on Vercel the backend service owns /api, and the
// Vite dev server proxies /api to the local backend.
const baseUrl = import.meta.env.VITE_API_URL || '/api';

const baseQuery = fetchBaseQuery({
  baseUrl,
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.token;
    if (token) headers.set('authorization', `Bearer ${token}`);
    // The API only accepts a session from the account's registered device
    headers.set('x-device-id', getDeviceId());
    return headers;
  },
});

// A 401 on a signed-in request means the server ended the session (it timed
// out, or the account was disabled), so sign out with the server's reason.
const baseQueryWithSession = async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions);
  if (result.error?.status === 401 && api.getState().auth.token) {
    api.dispatch(logout(result.error.data?.message || SESSION_EXPIRED_NOTICE));
  }
  return result;
};

// Central API slice. Feature-specific endpoints (auth, attendance, overtime,
// users, reports, settings) inject themselves into this via injectEndpoints so RTK
// Query's caching/invalidation ("tags") works consistently across the app.
export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithSession,
  tagTypes: ['Attendance', 'Overtime', 'User', 'Report', 'Settings', 'TimeLeave', 'Message', 'MessageInbox'],
  endpoints: () => ({}),
});
