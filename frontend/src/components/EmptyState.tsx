/**
 * Empty state when no conversation is selected
 */


export function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-state-content">
        <div className="empty-icon">&#x1F4AC;</div>
        <h2>Welcome to HUSH</h2>
        <p>Select a conversation or start a new one</p>
        <ul className="getting-started">
          <li>Add a contact using their UUID</li>
          <li>Click on a contact to start chatting</li>
          <li>All messages are end-to-end encrypted</li>
        </ul>
      </div>
    </div>
  );
}
