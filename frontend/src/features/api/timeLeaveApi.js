import { apiSlice } from './apiSlice';

// Time leaves (زمنيات). Decisions and cancellations change the day's totals,
// so they refresh attendance too.
export const timeLeaveApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    requestTimeLeave: builder.mutation({
      query: (body) => ({ url: '/time-leaves', method: 'POST', body }),
      invalidatesTags: ['TimeLeave', 'Attendance', 'Report'],
    }),
    getMyTimeLeaves: builder.query({
      query: () => '/time-leaves/me',
      providesTags: ['TimeLeave'],
    }),
    cancelTimeLeave: builder.mutation({
      query: (id) => ({ url: `/time-leaves/${id}/cancel`, method: 'PATCH' }),
      invalidatesTags: ['TimeLeave', 'Attendance', 'Report'],
    }),
    getTimeLeavesForReview: builder.query({
      query: (params) => ({ url: '/time-leaves/review', params }),
      providesTags: ['TimeLeave'],
    }),
    // How many time leaves each employee had in a period
    getTimeLeaveStats: builder.query({
      query: (params) => ({ url: '/time-leaves/stats', params }),
      providesTags: ['TimeLeave'],
    }),
    reviewTimeLeave: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/time-leaves/${id}/review`, method: 'PATCH', body }),
      invalidatesTags: ['TimeLeave', 'Attendance', 'Report'],
    }),
    // Managers and admins: add an approved leave for an employee (past days
    // too), correct its times, or withdraw it
    grantTimeLeave: builder.mutation({
      query: (body) => ({ url: '/time-leaves/grant', method: 'POST', body }),
      invalidatesTags: ['TimeLeave', 'Attendance', 'Report'],
    }),
    updateTimeLeave: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/time-leaves/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['TimeLeave', 'Attendance', 'Report'],
    }),
    revokeTimeLeave: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/time-leaves/${id}/revoke`, method: 'PATCH', body }),
      invalidatesTags: ['TimeLeave', 'Attendance', 'Report'],
    }),
  }),
});

export const {
  useRequestTimeLeaveMutation,
  useGetMyTimeLeavesQuery,
  useCancelTimeLeaveMutation,
  useGetTimeLeavesForReviewQuery,
  useGetTimeLeaveStatsQuery,
  useReviewTimeLeaveMutation,
  useGrantTimeLeaveMutation,
  useUpdateTimeLeaveMutation,
  useRevokeTimeLeaveMutation,
} = timeLeaveApi;
