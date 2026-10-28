import { useEffect, useRef, useState } from "react";
import Modal from "./Modal.jsx";

// onConfirm performs the delete and resolves when the request settles.
export default function DeleteEventModal({ event, onConfirm, onClose }) {
  const [deleting, setDeleting] = useState(false);

  // Start on Cancel, the safe choice for a destructive confirmation. (React's
  // autoFocus would fire before showModal() and be overridden by it.)
  const cancelRef = useRef(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  async function handleConfirm() {
    if (deleting) return;
    setDeleting(true);
    try {
      await onConfirm(event);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal title="Delete event" onClose={onClose} busy={deleting}>
      <p className="modal-text">
        Delete event "<strong>{event.name || "Untitled event"}</strong>"
        {event.company && (
          <>
            {" "}
            from the company <strong>{event.company}</strong>
          </>
        )}
        ? <br />
        This cannot be undone.
      </p>
      <div className="form-actions">
        <button
          ref={cancelRef}
          type="button"
          className="button"
          onClick={onClose}
          disabled={deleting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="button button-danger"
          onClick={handleConfirm}
          // aria-disabled rather than disabled, so focus stays on the button
          // while the request runs and is still there if it fails.
          aria-disabled={deleting || undefined}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Modal>
  );
}
