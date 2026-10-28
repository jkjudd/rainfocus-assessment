import { isNamedColor, normalizeColor } from "../lib/colors.js";
import { formatEventWhen } from "../lib/events.js";

// The event name is the button that opens the read-only details, so the company
// and description stay readable text. CSS stretches the button over the whole
// card to keep the card clickable; the Delete and Edit buttons sit above it.
export default function EventList({ events, onSelect, onEdit, onDelete }) {
  return (
    <ul className="event-list">
      {events.map((event) => {
        const color = normalizeColor(event.color);
        const name = event.name || "Untitled event";
        const when = formatEventWhen(event);
        return (
          <li key={event.id} className="event-card">
            <span
              className="swatch"
              style={isNamedColor(color) ? { background: color } : undefined}
              aria-hidden="true"
            />
            <div className="event-text">
              <h2 className="event-name">
                <button
                  type="button"
                  className="event-open"
                  onClick={() => onSelect(event)}
                >
                  {name}
                </button>
              </h2>
              <p className="event-company">{event.company || "No company"}</p>
              {(when || event.isActive === false) && (
                <p className="event-meta">
                  {when}
                  {event.isActive === false && (
                    <span className="badge">Inactive</span>
                  )}
                </p>
              )}
              <p className="event-description">{event.description}</p>
            </div>
            <div className="event-actions">
              <button
                type="button"
                className="button button-danger"
                onClick={() => onDelete(event)}
                aria-label={`Delete ${name}`}
              >
                Delete
              </button>
              <button
                type="button"
                className="button"
                onClick={() => onEdit(event)}
                aria-label={`Edit ${name}`}
              >
                Edit
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
