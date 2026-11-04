import { apiSlice } from './apiSlice';

export const messageApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Messages to show the signed-in user as a popup
    getMessageInbox: builder.query({
      query: () => '/messages/inbox',
      providesTags: ['MessageInbox'],
    }),
    markMessageRead: builder.mutation({
      query: (id) => ({ url: `/messages/${id}/read`, method: 'POST' }),
      invalidatesTags: ['MessageInbox', 'Message'],
    }),
    // Admin: sent messages, sending and deleting
    getMessages: builder.query({
      query: () => '/messages',
      providesTags: ['Message'],
    }),
    sendMessage: builder.mutation({
      query: (body) => ({ url: '/messages', method: 'POST', body }),
      invalidatesTags: ['Message', 'MessageInbox'],
    }),
    deleteMessage: builder.mutation({
      query: (id) => ({ url: `/messages/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Message', 'MessageInbox'],
    }),
  }),
});

export const {
  useGetMessageInboxQuery,
  useMarkMessageReadMutation,
  useGetMessagesQuery,
  useSendMessageMutation,
  useDeleteMessageMutation,
} = messageApi;
