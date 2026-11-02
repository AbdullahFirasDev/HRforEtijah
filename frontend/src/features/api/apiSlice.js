import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const baseQuery = fetchBaseQuery({
  baseUrl,
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.token;
    if (token) headers.set('authorization', `Bearer ${token}`);
    return headers;
  },
});

// Central API slice. Feature-specific endpoints (auth, attendance, overtime,
// users, reports) inject themselves into this via injectEndpoints so RTK
// Query's caching/invalidation ("tags") works consistently across the app.
export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Attendance', 'Overtime', 'User', 'Report'],
  endpoints: () => ({}),
});
