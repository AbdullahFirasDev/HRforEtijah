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
} = attendanceApi;
