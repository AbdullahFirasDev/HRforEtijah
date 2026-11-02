import { apiSlice } from './apiSlice';

export const settingsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getGeofence: builder.query({
      query: () => '/settings/geofence',
      providesTags: ['Settings'],
    }),
    updateGeofence: builder.mutation({
      query: (body) => ({ url: '/settings/geofence', method: 'PUT', body }),
      invalidatesTags: ['Settings'],
    }),
  }),
});

export const { useGetGeofenceQuery, useUpdateGeofenceMutation } = settingsApi;
