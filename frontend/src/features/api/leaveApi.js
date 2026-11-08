import { apiSlice } from './apiSlice';

// Leave requests (إجازات), their types and balances. A decision or a
// cancellation changes balances, so it refreshes them too.
const fileHeaders = (file, name) => ({ 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(name || file.name || '') });

export const leaveApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getLeaveMeta: builder.query({
      query: () => '/leaves/meta',
      providesTags: ['Leave'],
    }),
    getLeaveTypes: builder.query({
      query: (params) => ({ url: '/leaves/types', params }),
      providesTags: ['LeaveType'],
    }),
    createLeaveType: builder.mutation({
      query: (body) => ({ url: '/leaves/types', method: 'POST', body }),
      invalidatesTags: ['LeaveType', 'LeaveBalance'],
    }),
    updateLeaveType: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/leaves/types/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['LeaveType', 'LeaveBalance'],
    }),
    previewLeave: builder.mutation({
      query: (body) => ({ url: '/leaves/preview', method: 'POST', body }),
    }),
    uploadLeaveDraft: builder.mutation({
      query: ({ file, name }) => ({ url: '/leaves/attachments', method: 'POST', body: file, headers: fileHeaders(file, name) }),
    }),
    deleteLeaveDraft: builder.mutation({
      query: (id) => ({ url: `/leaves/attachments/${id}`, method: 'DELETE' }),
    }),
    requestLeave: builder.mutation({
      query: (body) => ({ url: '/leaves', method: 'POST', body }),
      invalidatesTags: ['Leave', 'LeaveBalance'],
    }),
    getMyLeaves: builder.query({
      query: (params) => ({ url: '/leaves/me', params }),
      providesTags: ['Leave', 'LeaveBalance'],
    }),
    getLeave: builder.query({
      query: (id) => `/leaves/${id}`,
      providesTags: ['Leave'],
    }),
    cancelLeave: builder.mutation({
      query: ({ id, reason }) => ({ url: `/leaves/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Leave', 'LeaveBalance'],
    }),
    reviewLeave: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/leaves/${id}/review`, method: 'PATCH', body }),
      invalidatesTags: ['Leave', 'LeaveBalance'],
    }),
    revokeLeave: builder.mutation({
      query: ({ id, reason }) => ({ url: `/leaves/${id}/revoke`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Leave', 'LeaveBalance'],
    }),
    addLeaveAttachment: builder.mutation({
      query: ({ id, file, name }) => ({ url: `/leaves/${id}/attachments`, method: 'POST', body: file, headers: fileHeaders(file, name) }),
      invalidatesTags: ['Leave'],
    }),
    removeLeaveAttachment: builder.mutation({
      query: ({ id, attId }) => ({ url: `/leaves/${id}/attachments/${attId}`, method: 'DELETE' }),
      invalidatesTags: ['Leave'],
    }),
    getLeavesForReview: builder.query({
      query: (params) => ({ url: '/leaves/review', params }),
      providesTags: ['Leave'],
    }),
    getLeaveFilters: builder.query({
      query: () => '/leaves/filters',
      providesTags: ['LeaveType', 'User'],
    }),
    getLeaveStatement: builder.query({
      query: (params) => ({ url: '/leaves/statement', params }),
      providesTags: ['Leave', 'LeaveBalance'],
    }),
    getLeaveReport: builder.query({
      query: (params) => ({ url: '/leaves/report', params }),
      providesTags: ['Leave'],
    }),
    getLeaveBalances: builder.query({
      query: (params) => ({ url: '/leaves/balances', params }),
      providesTags: ['LeaveBalance'],
    }),
    getLeaveBalanceEntries: builder.query({
      query: (params) => ({ url: '/leaves/balances/entries', params }),
      providesTags: ['LeaveBalance'],
    }),
    addLeaveBalanceEntry: builder.mutation({
      query: (body) => ({ url: '/leaves/balances', method: 'POST', body }),
      invalidatesTags: ['LeaveBalance'],
    }),
    grantLeaveBalance: builder.mutation({
      query: (body) => ({ url: '/leaves/balances/grant', method: 'POST', body }),
      invalidatesTags: ['LeaveBalance'],
    }),
  }),
});

export const {
  useGetLeaveMetaQuery,
  useGetLeaveTypesQuery,
  useCreateLeaveTypeMutation,
  useUpdateLeaveTypeMutation,
  usePreviewLeaveMutation,
  useUploadLeaveDraftMutation,
  useDeleteLeaveDraftMutation,
  useRequestLeaveMutation,
  useGetMyLeavesQuery,
  useGetLeaveQuery,
  useCancelLeaveMutation,
  useReviewLeaveMutation,
  useRevokeLeaveMutation,
  useAddLeaveAttachmentMutation,
  useRemoveLeaveAttachmentMutation,
  useGetLeavesForReviewQuery,
  useGetLeaveFiltersQuery,
  useGetLeaveStatementQuery,
  useGetLeaveReportQuery,
  useGetLeaveBalancesQuery,
  useGetLeaveBalanceEntriesQuery,
  useAddLeaveBalanceEntryMutation,
  useGrantLeaveBalanceMutation,
} = leaveApi;
