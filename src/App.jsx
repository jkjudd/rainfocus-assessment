import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  createEvent,
  deleteEvent,
  describeError,
  getEvents,
  isAbortError,
  updateEvent,
} from "./api/events.js";
import DeleteEventModal from "./components/DeleteEventModal.jsx";
import EventDetailsModal from "./components/EventDetailsModal.jsx";
import EventList from "./components/EventList.jsx";
import EventModal from "./components/EventModal.jsx";
import { formatCreatedOn, sortEventsByCompany } from "./lib/events.js";
import { useDismissToast, useToast } from "./toast/toastContext.js";
import "./App.css";

export default function App() {
  const showToast = useToast();
  const dismissToast = useDismissToast();
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  // null, { type: 'create' }, { type: 'view', id }, { type: 'edit', id } or
  // { type: 'delete', event }
  const [modal, setModal] = useState(null);

  // Error toasts stay until dismissed, so ones whose context has ended are
  // cleared: a load error once a retry succeeds, and a save or delete error
  // once its modal closes. (404 toasts stay: they explain a vanished card.)
  const loadErrorToast = useRef(null);
  const modalErrorToasts = useRef([]);
  useEffect(() => {
    const ids = modalErrorToasts.current;
    return () => {
      ids.forEach(dismissToast);
      ids.length = 0;
    };
  }, [modal, dismissToast]);

  useEffect(() => {
    const controller = new AbortController();
    getEvents({ signal: controller.signal })
      .then((list) => {
        setEvents(list);
        setStatus("ready");
        dismissToast(loadErrorToast.current);
        loadErrorToast.current = null;
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        setStatus("error");
        loadErrorToast.current = showToast(
          `Couldn't load events. ${describeError(error)}`,
        );
      });
    return () => controller.abort();
  }, [loadAttempt, showToast, dismissToast]);

  const sortedEvents = useMemo(() => sortEventsByCompany(events), [events]);

  const headingRef = useRef(null);

  const closeModal = useCallback(() => setModal(null), []);

  // A request can outlive its modal (the user may close it mid-request and open
  // another), so a finished request only closes the modal that started it.
  function closeIfCurrent(target) {
    setModal((current) => (current === target ? null : current));
  }

  const removeEvent = useCallback((id) => {
    setEvents((current) => current.filter((event) => event.id !== id));
  }, []);

  // "Try again" unmounts as soon as it's pressed, so focus follows the retry:
  // the loading message, then the heading on success or the button on failure.
  const statusRef = useRef(null);
  const retrying = useRef(false);
  useEffect(() => {
    if (!retrying.current) return;
    if (status === "ready") headingRef.current?.focus();
    else statusRef.current?.focus();
    if (status !== "loading") retrying.current = false;
  }, [status]);

  function reload() {
    retrying.current = true;
    setStatus("loading");
    setLoadAttempt((count) => count + 1);
  }

  // The list only changes after the server confirms the write, so a failed
  // request never leaves a phantom or stale event behind.
  async function handleSave(fields, existing) {
    const target = modal;
    try {
      if (existing) {
        // PUT replaces the record, so send it whole, but don't write the empty
        // createdOn the client fills in for an older record that never had one.
        const { createdOn, ...rest } = existing;
        const saved = await updateEvent({
          ...rest,
          ...(createdOn && { createdOn }),
          ...fields,
        });
        setEvents((current) =>
          current.map((event) => (event.id === saved.id ? saved : event)),
        );
        showToast(`Updated “${saved.name}”.`, { type: "success" });
      } else {
        const created = await createEvent({
          ...fields,
          createdOn: formatCreatedOn(),
        });
        setEvents((current) => [...current, created]);
        showToast(`Created “${created.name}”.`, { type: "success" });
      }
      closeIfCurrent(target);
    } catch (error) {
      const toastId = showToast(
        `Couldn't ${existing ? "update" : "create"} the event. ${describeError(error)}`,
      );
      if (existing && error.status === 404)
        removeAndRefocus(existing.id, target);
      else modalErrorToasts.current.push(toastId);
    }
  }

  // Removing an event and closing its modal happen in one commit, and the modal
  // returns focus to its opener (the event's card or Delete button) before the
  // card is removed, so focus has to move to the page heading afterwards.
  function removeAndRefocus(id, target) {
    flushSync(() => {
      removeEvent(id);
      closeIfCurrent(target);
    });
    if (!document.querySelector("dialog[open]")) headingRef.current?.focus();
  }

  async function handleDelete(event) {
    const target = modal;
    try {
      await deleteEvent(event.id);
      showToast(`Deleted “${event.name}”.`, { type: "success" });
      removeAndRefocus(event.id, target);
    } catch (error) {
      const toastId = showToast(
        `Couldn't delete the event. ${describeError(error)}`,
      );
      if (error.status === 404) removeAndRefocus(event.id, target);
      else modalErrorToasts.current.push(toastId);
    }
  }

  let content;
  if (status === "loading") {
    content = (
      <p ref={statusRef} className="list-status" role="status" tabIndex={-1}>
        Loading events…
      </p>
    );
  } else if (status === "error") {
    content = (
      <div className="list-status">
        <p>Events couldn't be loaded.</p>
        <button
          ref={statusRef}
          type="button"
          className="button button-primary"
          onClick={reload}
        >
          Try again
        </button>
      </div>
    );
  } else if (sortedEvents.length === 0) {
    content = (
      <p className="list-status">No events yet. Add one to get started.</p>
    );
  } else {
    content = (
      <EventList
        events={sortedEvents}
        onSelect={(event) => setModal({ type: "view", id: event.id })}
        onEdit={(event) => setModal({ type: "edit", id: event.id })}
        onDelete={(event) => setModal({ type: "delete", event })}
      />
    );
  }

  return (
    <>
      <header className="app-header">
        <div>
          <h1 ref={headingRef} tabIndex={-1}>
            Events
          </h1>
          <p className="subtitle">
            Create, edit, and delete events – (Sorted by company name)
          </p>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={() => setModal({ type: "create" })}
          disabled={status !== "ready"}
        >
          New
        </button>
      </header>

      <main className="app-main">{content}</main>

      {modal?.type === "create" && (
        <EventModal onSave={handleSave} onClose={closeModal} />
      )}
      {modal?.type === "view" && (
        <EventDetailsModal
          key={modal.id}
          eventId={modal.id}
          onMissing={removeEvent}
          onClose={closeModal}
        />
      )}
      {modal?.type === "edit" && (
        <EventModal
          key={modal.id}
          eventId={modal.id}
          onSave={handleSave}
          onMissing={removeEvent}
          onClose={closeModal}
        />
      )}
      {modal?.type === "delete" && (
        <DeleteEventModal
          event={modal.event}
          onConfirm={handleDelete}
          onClose={closeModal}
        />
      )}
    </>
  );
}
