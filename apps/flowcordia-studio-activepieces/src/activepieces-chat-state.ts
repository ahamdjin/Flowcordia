import type { StoreApi } from "zustand";

export type ChatDrawerSource = string | null;
export type ChatMessage = unknown;
export type Messages = ChatMessage[];

export type ChatState = {
  chatDrawerOpenSource: ChatDrawerSource;
  chatSessionMessages: Messages;
  chatSessionId: string | null;
  setChatDrawerOpenSource: (source: ChatDrawerSource) => void;
  setChatSessionMessages: (messages: Messages) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearChatSession: () => void;
  setChatSessionId: (sessionId: string | null) => void;
};

type BuilderStateWithChat = ChatState & Record<string, unknown>;

export function createChatState(set: StoreApi<BuilderStateWithChat>["setState"]): ChatState {
  return {
    chatDrawerOpenSource: null,
    chatSessionMessages: [],
    chatSessionId: null,
    setChatDrawerOpenSource: (source) => set({ chatDrawerOpenSource: source }),
    setChatSessionMessages: (messages) => set({ chatSessionMessages: messages }),
    addChatMessage: (message) =>
      set((state) => ({
        chatSessionMessages: [...state.chatSessionMessages, message],
      })),
    clearChatSession: () => set({ chatSessionMessages: [], chatSessionId: null }),
    setChatSessionId: (chatSessionId) => set({ chatSessionId }),
  };
}
