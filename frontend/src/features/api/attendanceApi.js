import { apiSlice } from './apiSlice';

export const attendanceApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    punchIn: builder.mutation({
      query: (body) => ({ url: '/attendance/punch-in', method: 'POST', body }),
      invalidatesTags: ['Attendance'],
    }),
    punchOut: builder.mutation({
      query: (body) => ({ url: '/attendance/punch-out', method: 'POST', body }),
      invalidatesTags: ['Attendance'],
    }),
    getTodayStatus: builder.query({
      query: () => '/attendance/today',
      providesTags: ['Attendance'],
    }),
    getMyAttendance: builder.query({
      query: (params) => ({ url: '/attendance/me', params }),
      providesTags: ['Attendance'],
    }),
    getTeamAttendance: builder.query({
      query: (params) => ({ url: '/attendance/team', params }),
      providesTags: ['Attendance'],
    }),
    getAllAttendance: builder.query({
      query: (params) => ({ url: '/attendance/all', params }),
      providesTags: ['Attendance'],
    }),
    // Admin only; also removes overtime requests filed against the records
    deleteAttendance: builder.mutation({
      query: (ids) => ({ url: '/attendance/delete', method: 'POST', body: { ids } }),
      invalidatesTags: ['Attendance', 'Overtime', 'Report'],
    }),
    // Keep working past the end of the open period (1–4 hours at a time)
    extendSession: builder.mutation({
      query: (body) => ({ url: '/attendance/extend', method: 'POST', body }),
      invalidatesTags: ['Attendance'],
    }),
    // Admin: a record's periods and correction history
    getAttendanceRecord: builder.query({
      query: (id) => `/attendance/${id}`,
      providesTags: ['Attendance'],
    }),
    // Admin: correct a day's check-in/check-out times
    editAttendancePeriods: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/attendance/${id}/periods`, method: 'PATCH', body }),
      invalidatesTags: ['Attendance', 'Report'],
    }),
    // Admin: record a day the employee never checked in
    addManualAttendance: builder.mutation({
      query: (body) => ({ url: '/attendance/manual', method: 'POST', body }),
      invalidatesTags: ['Attendance', 'Report'],
    }),
    validateAttendance: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/attendance/${id}/validate`, method: 'PATCH', body }),
      invalidatesTags: ['Attendance'],
    }),
  }),
});

export const {
  usePunchInMutation,
  usePunchOutMutation,
  useGetTodayStatusQuery,
  useGetMyAttendanceQuery,
  useGetTeamAttendanceQuery,
  useGetAllAttendanceQuery,
  useValidateAttendanceMutation,
  useDeleteAttendanceMutation,
  useExtendSessionMutation,
  useGetAttendanceRecordQuery,
  useEditAttendancePeriodsMutation,
  useAddManualAttendanceMutation,
} = attendanceApi;
