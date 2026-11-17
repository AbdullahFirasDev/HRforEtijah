import { apiSlice } from './apiSlice';

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation({
      query: (credentials) => ({ url: '/auth/login', method: 'POST', body: credentials }),
    }),
    // Face login: the print from the camera, checked against the accounts
    // registered on this device
    faceLogin: builder.mutation({
      query: (body) => ({ url: '/auth/face-login', method: 'POST', body }),
    }),
    // Who may sign in with their face on this device
    getDeviceAccounts: builder.query({
      query: (deviceId) => ({ url: '/auth/device', method: 'POST', body: { deviceId } }),
    }),
    register: builder.mutation({
      query: (data) => ({ url: '/auth/register', method: 'POST', body: data }),
    }),
    getMe: builder.query({
      query: () => '/auth/me',
    }),
    getManagersList: builder.query({
      query: () => '/users/managers',
      // Refetch after users are added or their roles change
      providesTags: ['User'],
    }),
  }),
});

export const {
  useLoginMutation,
  useFaceLoginMutation,
  useGetDeviceAccountsQuery,
  useRegisterMutation,
  useGetMeQuery,
  useGetManagersListQuery,
} = authApi;
