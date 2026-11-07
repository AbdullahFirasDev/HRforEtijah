import { apiSlice } from './apiSlice';

export const notificationApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // { enabled, count }: enabled is false until the administrator sets the feature up
    getUnreadCount: builder.query({
      query: () => '/notifications/unread-count',
      providesTags: ['NotificationCount'],
    }),
    // Newest first; `before` is the id of the last one already shown
    getNotifications: builder.query({
      query: ({ limit = 20, unread = false, before } = {}) => ({
        url: '/notifications',
        params: { limit, ...(unread ? { unread: 1 } : {}), ...(before ? { before } : {}) },
      }),
      providesTags: ['Notification'],
    }),
    markNotificationRead: builder.mutation({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'POST' }),
      invalidatesTags: ['Notification', 'NotificationCount'],
    }),
    markAllNotificationsRead: builder.mutation({
      query: () => ({ url: '/notifications/read-all', method: 'POST' }),
      invalidatesTags: ['Notification', 'NotificationCount'],
    }),
    getNotificationSettings: builder.query({
      query: () => '/notifications/settings',
      providesTags: ['NotificationSettings'],
    }),
    updateNotificationSettings: builder.mutation({
      query: (categories) => ({ url: '/notifications/settings', method: 'PUT', body: { categories } }),
      invalidatesTags: ['NotificationSettings'],
    }),
    // This browser's push subscription (endpoint + keys)
    savePushSubscription: builder.mutation({
      query: (subscription) => ({ url: '/notifications/subscriptions', method: 'POST', body: subscription }),
      invalidatesTags: ['NotificationSettings'],
    }),
    // { endpoint } for this browser, or { id } from the device list
    deletePushSubscription: builder.mutation({
      query: (body) => ({ url: '/notifications/subscriptions', method: 'DELETE', body }),
      invalidatesTags: ['NotificationSettings'],
    }),
    sendTestPush: builder.mutation({
      query: () => ({ url: '/notifications/test', method: 'POST' }),
      invalidatesTags: ['NotificationSettings'],
    }),
  }),
});

export const {
  useGetUnreadCountQuery,
  useGetNotificationsQuery,
  useLazyGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useGetNotificationSettingsQuery,
  useUpdateNotificationSettingsMutation,
  useSavePushSubscriptionMutation,
  useDeletePushSubscriptionMutation,
  useSendTestPushMutation,
} = notificationApi;
