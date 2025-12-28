'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { apiClient, formatRelativeTime } from '@/lib/api';
import Link from 'next/link';

interface Conversation {
  id: string;
  participant: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
    role: string;
  };
  listing?: {
    id: string;
    title: string;
    address: string;
  };
  lastMessage?: {
    content: string;
    createdAt: string;
    senderId: string;
  };
  unreadCount: number;
  updatedAt: string;
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  read: boolean;
}

function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Conversation[] }>('/messages/conversations');
      return res.data;
    },
  });
}

function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const res = await apiClient.get<{ data: Message[] }>(`/messages/conversations/${conversationId}`);
      return res.data;
    },
    enabled: !!conversationId,
  });
}

function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      const res = await apiClient.post(`/messages/conversations/${conversationId}`, { content });
      return res;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export default function MessagesPage() {
  const { user, isAuthenticated } = useAuth();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [newMessage, setNewMessage] = useState('');
  
  const { data: conversations, isLoading: loadingConversations } = useConversations();
  const { data: messages, isLoading: loadingMessages } = useMessages(selectedConversation?.id ?? null);
  const sendMessage = useSendMessage();

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center">
        <div className="card text-center">
          <h2 className="text-2xl font-display font-bold text-white mb-4">Sign In Required</h2>
          <p className="text-gray-400 mb-6">Please sign in to view your messages.</p>
          <Link href="/auth/login" className="btn-primary">Sign In</Link>
        </div>
      </div>
    );
  }

  const handleSend = async () => {
    if (!selectedConversation || !newMessage.trim()) return;
    
    await sendMessage.mutateAsync({
      conversationId: selectedConversation.id,
      content: newMessage.trim(),
    });
    setNewMessage('');
  };

  return (
    <div className="min-h-screen bg-charcoal">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-display font-bold text-white mb-8">Messages</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
          {/* Conversations List */}
          <div className="lg:col-span-1 card p-0 overflow-hidden">
            <div className="p-4 border-b border-gray-700">
              <h2 className="font-semibold text-white">Conversations</h2>
            </div>
            
            <div className="overflow-y-auto h-full">
              {loadingConversations ? (
                <div className="p-4 text-gray-400">Loading...</div>
              ) : conversations?.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-12 h-12 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-gray-400">No conversations yet</p>
                  <p className="text-sm text-gray-500 mt-2">Start a conversation from a listing page</p>
                </div>
              ) : (
                conversations?.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversation(conv)}
                    className={`w-full p-4 text-left border-b border-gray-700 hover:bg-gray-800 transition-colors ${
                      selectedConversation?.id === conv.id ? 'bg-gray-800' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal to-gold flex items-center justify-center text-white font-bold">
                        {conv.participant.firstName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white truncate">
                            {conv.participant.firstName} {conv.participant.lastName}
                          </span>
                          {conv.unreadCount > 0 && (
                            <span className="bg-teal text-white text-xs px-2 py-0.5 rounded-full">
                              {conv.unreadCount}
                            </span>
                          )}
                        </div>
                        {conv.listing && (
                          <p className="text-xs text-gold truncate">{conv.listing.title}</p>
                        )}
                        {conv.lastMessage && (
                          <p className="text-sm text-gray-400 truncate mt-1">
                            {conv.lastMessage.content}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {formatRelativeTime(conv.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-2 card p-0 flex flex-col overflow-hidden">
            {selectedConversation ? (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-gray-700 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal to-gold flex items-center justify-center text-white font-bold">
                    {selectedConversation.participant.firstName[0]}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">
                      {selectedConversation.participant.firstName} {selectedConversation.participant.lastName}
                    </h3>
                    {selectedConversation.listing && (
                      <Link 
                        href={`/listings/${selectedConversation.listing.id}`}
                        className="text-sm text-gold hover:underline"
                      >
                        {selectedConversation.listing.title}
                      </Link>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {loadingMessages ? (
                    <div className="text-gray-400 text-center">Loading messages...</div>
                  ) : messages?.length === 0 ? (
                    <div className="text-gray-400 text-center">No messages yet. Start the conversation!</div>
                  ) : (
                    messages?.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                            message.senderId === user?.id
                              ? 'bg-teal text-white rounded-br-md'
                              : 'bg-gray-700 text-white rounded-bl-md'
                          }`}
                        >
                          <p>{message.content}</p>
                          <p className={`text-xs mt-1 ${
                            message.senderId === user?.id ? 'text-teal-200' : 'text-gray-400'
                          }`}>
                            {formatRelativeTime(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Message Input */}
                <div className="p-4 border-t border-gray-700">
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                      placeholder="Type a message..."
                      className="input flex-1"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!newMessage.trim() || sendMessage.isPending}
                      className="btn-primary px-6"
                    >
                      {sendMessage.isPending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <p className="text-gray-400">Select a conversation to start messaging</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
