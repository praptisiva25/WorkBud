type Note = { title: string; body: string; dueAtUtc?: string };
const q = new Map<string, Note[]>(); // userId -> pending notifications

export function enqueue(userId: string, note: Note) {
  const arr = q.get(userId) ?? [];
  arr.push(note);
  q.set(userId, arr);
}

export function drain(userId: string): Note[] {
  const arr = q.get(userId) ?? [];
  q.delete(userId);
  return arr;
}
