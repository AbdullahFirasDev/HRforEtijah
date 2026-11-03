import { apiSlice } from './apiSlice';

export const timesheetApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Totals per employee for managers (their team) and admins (everyone)
    getTimesheetSummary: builder.query({
      query: (params) => ({ url: '/timesheets/summary', params }),
      providesTags: ['Attendance', 'Overtime'],
    }),
    // One employee's days; without userId, the signed-in user's own
    getTimesheet: builder.query({
      query: ({ userId, ...params }) => ({ url: userId ? `/timesheets/user/${userId}` : '/timesheets/me', params }),
      providesTags: ['Attendance', 'Overtime'],
    }),
    // Admin: recalculate recorded days on the employee's current schedule
    reapplySchedule: builder.mutation({
      query: ({ userId, from, to }) => ({ url: `/timesheets/user/${userId}/reapply`, method: 'POST', body: { from, to } }),
      invalidatesTags: ['Attendance'],
    }),
  }),
});

export const { useGetTimesheetSummaryQuery, useGetTimesheetQuery, useReapplyScheduleMutation } = timesheetApi;
