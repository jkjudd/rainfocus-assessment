import { useEffect, useId, useRef, useState } from "react";
import { NAMED_COLORS, isNamedColor, normalizeColor } from "../lib/colors.js";
import {
  FIELD_LIMITS,
  cleanEventFields,
  validateEventFields,
} from "../lib/events.js";

// Labels of the editable fields, in form order, for the missing-fields hint.
const FIELD_LABELS = {
  name: "Event name",
  description: "Description",
  company: "Company name",
  color: "Color",
  date: "Date",
  time: "Time",
  email: "Email",
  phone: "Phone",
  address: "Address",
  image: "Image URL",
  isActive: "Status",
};

function sameFields(a, b) {
  const cleanA = cleanEventFields(a);
  const cleanB = cleanEventFields(b);
  return Object.keys(cleanA).every((key) => cleanA[key] === cleanB[key]);
}

// Controlled form for an event's editable properties (see EMPTY_EVENT_FIELDS). The
// submit button stays disabled until every field is valid (and, when editing,
// until something has changed). onSubmit receives the cleaned values.
export default function EventForm({
  initialFields,
  submitLabel,
  savingLabel,
  saving,
  requireChanges = false,
  onSubmit,
  onCancel,
}) {
  const [fields, setFields] = useState(initialFields);
  const [touched, setTouched] = useState({});
  const ids = useId();

  // Start on the first field. A passive effect runs after the dialog's
  // showModal() (a layout effect), which would otherwise focus the Close button;
  // the edit form also mounts later, once its event has loaded.
  const nameRef = useRef(null);
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const errors = validateEventFields(fields);
  const isValid = Object.keys(errors).length === 0;
  const hasChanges = !sameFields(fields, initialFields);
  const isReady = isValid && (!requireChanges || hasChanges);
  const canSubmit = isReady && !saving;

  // Errors appear once a field has been visited or edited, or straight away for
  // a pre-filled value that is already invalid. When editing, every error shows
  // at once: an empty field there is one an older event lacks.
  function visibleError(field) {
    const shown =
      requireChanges ||
      touched[field] ||
      fields[field] !== initialFields[field] ||
      initialFields[field] !== "";
    return shown ? errors[field] : undefined;
  }

  // Fields an older event lacks (it was created before they existed) and that
  // are still unfilled, for the hint.
  const missingLabels = requireChanges
    ? Object.keys(FIELD_LABELS).filter(
        (field) =>
          errors[field] &&
          (initialFields[field] === "" || initialFields[field] == null),
      )
    : [];

  let hint = "All fields are required.";
  if (saving) hint = `${savingLabel} Please wait.`;
  else if (missingLabels.length) {
    hint =
      `This event is missing ${missingLabels.length === 1 ? "a field" : "fields"} added since it ` +
      `was created: ${missingLabels.map((field) => FIELD_LABELS[field]).join(", ")}. ` +
      `Fill ${missingLabels.length === 1 ? "it" : "them"} in to save.`;
  } else if (requireChanges && isValid && !hasChanges) {
    hint = "Make changes. All fields are required.";
  }

  function handleChange(event) {
    const { name, value } = event.target;
    // The status radios carry "true" / "false".
    setFields((current) => ({
      ...current,
      [name]: name === "isActive" ? value === "true" : value,
    }));
  }

  function handleBlur(event) {
    const { name } = event.target;
    // Focus moved out of the dialog by script (e.g. StrictMode remounting the
    // modal) isn't a visit; inside a modal, a user can't move it elsewhere.
    const next = event.relatedTarget;
    if (next && !event.currentTarget.closest("dialog")?.contains(next)) return;
    setTouched((current) => ({ ...current, [name]: true }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(cleanEventFields(fields));
  }

  function fieldProps(field) {
    const error = visibleError(field);
    return {
      id: `${ids}-${field}`,
      name: field,
      value: fields[field],
      onChange: handleChange,
      onBlur: handleBlur,
      readOnly: saving,
      required: true,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": error ? `${ids}-${field}-error` : undefined,
    };
  }

  function errorText(field) {
    const error = visibleError(field);
    return error ? (
      <p className="field-error" id={`${ids}-${field}-error`}>
        {error}
      </p>
    ) : null;
  }

  // A labelled single-line input with its error, for the plainer fields.
  function inputField(field, label, inputProps) {
    return (
      <div className="field">
        <label htmlFor={`${ids}-${field}`}>{label}</label>
        <input
          {...fieldProps(field)}
          maxLength={FIELD_LIMITS[field]}
          {...inputProps}
        />
        {errorText(field)}
      </div>
    );
  }

  const colorIsValid = isNamedColor(fields.color);
  // Preview the image URL once the field is left (not on every keystroke, which
  // would request each partial URL), if it's valid and hasn't failed to load.
  const [previewSrc, setPreviewSrc] = useState(() =>
    initialFields.image.trim(),
  );
  const [brokenImage, setBrokenImage] = useState(null);
  const imageSrc = fields.image.trim();
  const showImagePreview =
    !errors.image && imageSrc === previewSrc && imageSrc !== brokenImage;

  return (
    <form className="event-form" onSubmit={handleSubmit} noValidate>
      {/* At the top of the form, where it's visible when Enter submits from the
          first fields; the submit button itself is often scrolled out of view.
          Not a live region, or the missing-fields list would be re-read after
          every field: the hidden status below announces saving only. */}
      <p className="form-hint" id={`${ids}-hint`}>
        {hint}
      </p>
      <p className="visually-hidden" role="status">
        {saving ? `${savingLabel} Please wait.` : ""}
      </p>
      {/* Fields go read-only, not disabled, while saving: disabling the focused
          input (Enter to submit) would drop focus to <body>. */}
      <fieldset aria-busy={saving || undefined}>
        <div className="field">
          <label htmlFor={`${ids}-name`}>Event name</label>
          <input
            {...fieldProps("name")}
            ref={nameRef}
            type="text"
            maxLength={FIELD_LIMITS.name}
            autoComplete="off"
          />
          {errorText("name")}
        </div>

        <div className="field">
          <label htmlFor={`${ids}-description`}>Description</label>
          <textarea
            {...fieldProps("description")}
            rows={4}
            maxLength={FIELD_LIMITS.description}
          />
          <div className="field-meta">
            {errorText("description")}
            <span className="char-count">
              {fields.description.trim().length}/{FIELD_LIMITS.description}
            </span>
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${ids}-company`}>Company name</label>
          <input
            {...fieldProps("company")}
            type="text"
            maxLength={FIELD_LIMITS.company}
            autoComplete="organization"
          />
          {errorText("company")}
        </div>

        <div className="field">
          <label htmlFor={`${ids}-color`}>Color</label>
          <div className="color-input">
            <span
              className="swatch"
              aria-hidden="true"
              style={
                colorIsValid
                  ? { background: normalizeColor(fields.color) }
                  : undefined
              }
            />
            <input
              {...fieldProps("color")}
              type="text"
              list={`${ids}-color-options`}
              placeholder="e.g. red, teal, orange"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <datalist id={`${ids}-color-options`}>
            {NAMED_COLORS.map((color) => (
              <option key={color} value={color} />
            ))}
          </datalist>
          {errorText("color")}
        </div>

        <div className="field-row">
          {inputField("date", "Date", { type: "date" })}
          {inputField("time", "Time", { type: "time" })}
        </div>

        <div className="field-row">
          {inputField("email", "Email", {
            type: "email",
            autoComplete: "off",
            spellCheck: false,
          })}
          {inputField("phone", "Phone", {
            type: "tel",
            autoComplete: "off",
            placeholder: "e.g. +1 (831) 446-3332",
          })}
        </div>

        {inputField("address", "Address", {
          type: "text",
          autoComplete: "off",
        })}

        <div className="field">
          <label htmlFor={`${ids}-image`}>Image URL</label>
          <div className="image-input">
            <input
              {...fieldProps("image")}
              onBlur={(event) => {
                handleBlur(event);
                setPreviewSrc(imageSrc);
              }}
              type="url"
              maxLength={FIELD_LIMITS.image}
              placeholder="https://…"
              autoComplete="off"
              spellCheck={false}
            />
            {showImagePreview && (
              <img
                className="image-preview"
                src={imageSrc}
                alt=""
                onError={() => setBrokenImage(imageSrc)}
              />
            )}
          </div>
          {errorText("image")}
        </div>

        {/* Radios rather than a checkbox, so an older event with no status
            stays unset until the user chooses one. */}
        <fieldset
          className="field field-radios"
          // radiogroup, unlike radio, supports aria-readonly and aria-required.
          role="radiogroup"
          aria-required="true"
          aria-readonly={saving || undefined}
          aria-invalid={visibleError("isActive") ? true : undefined}
          aria-describedby={
            visibleError("isActive") ? `${ids}-isActive-error` : undefined
          }
        >
          <legend>Status</legend>
          <div className="radio-options">
            {[
              [true, "Active"],
              [false, "Inactive"],
            ].map(([value, label]) => (
              <label key={label} className="radio-option">
                <input
                  type="radio"
                  name="isActive"
                  value={String(value)}
                  checked={fields.isActive === value}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  // Read-only radios still change, so block clicks while saving.
                  onClick={
                    saving ? (event) => event.preventDefault() : undefined
                  }
                />
                {label}
              </label>
            ))}
          </div>
          {errorText("isActive")}
        </fieldset>
      </fieldset>

      <div className="form-actions">
        <button
          type="button"
          className="button"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        {/* While saving, aria-disabled keeps focus on the button (a disabled
            button drops it) and handleSubmit ignores repeat submits. */}
        <button
          type="submit"
          className="button button-primary"
          disabled={!isReady}
          aria-disabled={saving || undefined}
          aria-describedby={isReady ? undefined : `${ids}-hint`}
        >
          {saving ? savingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
