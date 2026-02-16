/**
 * Empty state when no conversation is selected
 */


import { CheckCircle2, MessageSquare } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-text-secondary">
      <div className="max-w-md p-8 text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full border border-border bg-bg-tertiary text-text-primary">
          <MessageSquare className="h-8 w-8" />
        </div>
        <h2 className="mb-2 text-text-primary">Welcome to HUSH</h2>
        <p>Select a conversation or start a new one</p>
        <ul className="mt-6 list-none p-0 text-left">
          <li className="flex items-center gap-2 py-2 text-body text-text-secondary"><CheckCircle2 className="h-4 w-4 text-success" />Add a contact using their UUID</li>
          <li className="flex items-center gap-2 py-2 text-body text-text-secondary"><CheckCircle2 className="h-4 w-4 text-success" />Click on a contact to start chatting</li>
          <li className="flex items-center gap-2 py-2 text-body text-text-secondary"><CheckCircle2 className="h-4 w-4 text-success" />All messages are end-to-end encrypted</li>
        </ul>
      </div>
    </div>
  );
}
