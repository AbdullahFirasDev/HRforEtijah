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
  useGetDailyReportQuery,
} = userApi;
