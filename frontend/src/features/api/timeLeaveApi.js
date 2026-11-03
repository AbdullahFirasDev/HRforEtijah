import { apiSlice } from './apiSlice';

// Time leaves (زمنيات). Decisions and cancellations change the day's totals,
// so they refresh attendance too.
export const timeLeaveApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    requestTimeLeave: builder.mutation({
      query: (body) => ({ url: '/time-leaves', method: 'POST', body }),
      invalidatesTags: ['TimeLeave', 'Attendance'],
    }),
    getMyTimeLeaves: builder.query({
      query: () => '/time-leaves/me',
      providesTags: ['TimeLeave'],
    }),
    cancelTimeLeave: builder.mutation({
      query: (id) => ({ url: `/time-leaves/${id}/cancel`, method: 'PATCH' }),
      invalidatesTags: ['TimeLeave', 'Attendance'],
    }),
    getTimeLeavesForReview: builder.query({
      query: (params) => ({ url: '/time-leaves/review', params }),
      providesTags: ['TimeLeave'],
    }),
    reviewTimeLeave: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/time-leaves/${id}/review`, method: 'PATCH', body }),
      invalidatesTags: ['TimeLeave', 'Attendance'],
    }),
  }),
});

export const {
  useRequestTimeLeaveMutation,
  useGetMyTimeLeavesQuery,
  useCancelTimeLeaveMutation,
  useGetTimeLeavesForReviewQuery,
  useReviewTimeLeaveMutation,
} = timeLeaveApi;
