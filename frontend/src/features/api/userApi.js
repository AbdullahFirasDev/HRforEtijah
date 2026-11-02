import { apiSlice } from './apiSlice';

export const userApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getAllUsers: builder.query({
      query: (params) => ({ url: '/users', params }),
      providesTags: ['User'],
    }),
    createUser: builder.mutation({
      query: (body) => ({ url: '/users', method: 'POST', body }),
      invalidatesTags: ['User'],
    }),
    getMyTeam: builder.query({
      query: () => '/users/team',
      providesTags: ['User'],
    }),
    updateUser: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/users/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['User'],
    }),
    resetDevice: builder.mutation({
      query: (id) => ({ url: `/users/${id}/reset-device`, method: 'PATCH' }),
      invalidatesTags: ['User'],
    }),
    changePassword: builder.mutation({
      query: ({ id, password }) => ({ url: `/users/${id}/password`, method: 'PATCH', body: { password } }),
      invalidatesTags: ['User'],
    }),
    deleteUser: builder.mutation({
      query: ({ id, transferTo }) => ({ url: `/users/${id}`, method: 'DELETE', params: transferTo ? { transferTo } : undefined }),
      invalidatesTags: ['User', 'Attendance', 'Overtime', 'Report'],
    }),
    getDailyReport: builder.query({
      query: (params) => ({ url: '/reports/daily', params }),
      providesTags: ['Report'],
    }),
  }),
});

export const {
  useGetAllUsersQuery,
  useCreateUserMutation,
  useGetMyTeamQuery,
  useUpdateUserMutation,
  useResetDeviceMutation,
  useChangePasswordMutation,
  useDeleteUserMutation,
  useGetDailyReportQuery,
} = userApi;
