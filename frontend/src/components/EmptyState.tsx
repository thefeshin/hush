/**
 * Empty state when no conversation is selected
 */


export function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-text-secondary">
      <div className="max-w-md p-8 text-center">
        <div className="mb-4 text-[4rem]">&#x1F4AC;</div>
        <h2 className="mb-2 text-text-primary">Welcome to HUSH</h2>
        <p>Select a conversation or start a new one</p>
        <ul className="mt-6 list-none p-0 text-left">
          <li className="relative py-2 pl-6 text-sm text-text-secondary before:absolute before:left-0 before:text-success before:content-['\2713']">Add a contact using their UUID</li>
          <li className="relative py-2 pl-6 text-sm text-text-secondary before:absolute before:left-0 before:text-success before:content-['\2713']">Click on a contact to start chatting</li>
          <li className="relative py-2 pl-6 text-sm text-text-secondary before:absolute before:left-0 before:text-success before:content-['\2713']">All messages are end-to-end encrypted</li>
        </ul>
      </div>
    </div>
  );
}
