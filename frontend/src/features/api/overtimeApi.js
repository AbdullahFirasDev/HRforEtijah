import { apiSlice } from './apiSlice';

export const overtimeApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    requestOvertime: builder.mutation({
      query: (body) => ({ url: '/overtime/request', method: 'POST', body }),
      invalidatesTags: ['Overtime', 'Attendance'],
    }),
    updateOvertime: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/overtime/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Overtime', 'Attendance'],
    }),
    getMyOvertime: builder.query({
      query: () => '/overtime/me',
      providesTags: ['Overtime'],
    }),
    getPendingOvertime: builder.query({
      query: () => '/overtime/pending',
      providesTags: ['Overtime'],
    }),
    getAllOvertimeForReviewer: builder.query({
      query: () => '/overtime/all',
      providesTags: ['Overtime'],
    }),
    reviewOvertime: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/overtime/${id}/review`, method: 'PATCH', body }),
      invalidatesTags: ['Overtime', 'Attendance'],
    }),
  }),
});

export const {
  useRequestOvertimeMutation,
  useUpdateOvertimeMutation,
  useGetMyOvertimeQuery,
  useGetPendingOvertimeQuery,
  useGetAllOvertimeForReviewerQuery,
  useReviewOvertimeMutation,
} = overtimeApi;
