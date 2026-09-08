export type Thread = {
  id: string;
  type: "user_chat" | "group_chat" | "copilot";
  title: string | null;
  dmKey: string | null;
  updatedAt: string;
};

export type Msg = {
  id: string;
  threadId: string;
  senderId: string;
  senderName?: string | null;
  source: "manual" | "copilot" | "system";
  kind: "text" | "image" | "file";
  content: string | null;
  createdAt: string;
};
