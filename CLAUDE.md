# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

A single-page events manager (JavaScript, not TypeScript) built on the `create-vite` React template for an assessment (`React API Assignment.pdf`). It lists, creates, edits and deletes events against the shared json-server at `https://rf-json-server.herokuapp.com/events/`. That server is public and shared: when testing writes against it, create your own event and delete it afterwards rather than editing or deleting the seeded events (ids 1–5).

## Commands

- `npm run dev`: start the Vite dev server with HMR
- `npm run build`: production build to `dist/`
- `npm run preview`: serve the production build locally
- `npm run lint`: run ESLint over the project
- `npm test`: run the Vitest unit tests once (`npx vitest` for watch mode)
- `npm run test:coverage`: the same with v8 coverage (output in `coverage/`, which is git- and lint-ignored)

`src/test/setup.js` (wired up in the `test` block of `vite.config.js`) replaces `fetch` with a guard that throws, so no test can reach the shared server. It's assigned directly rather than with `vi.stubGlobal`, so `vi.unstubAllGlobals()` restores the guard, not the real `fetch`. In `App.test.jsx`, mock the API with `mockGetEvents`/`mockGetEvent`. Like `fetch`, they reject with an `AbortError` when the request is aborted, and StrictMode always aborts the first load. Plain `mockResolvedValue`/`mockRejectedValue` ignore the signal, so tests built on them pass for the wrong reasons.

Tests sit next to the code. `*.test.js` cover the pure modules (validation, sorting, the API client with a stubbed `fetch`). `src/App.test.jsx` runs the whole app in jsdom with Testing Library, StrictMode and a mocked API module. jsdom has no `showModal()`, so that file stubs it and fires `close` asynchronously the way browsers do. jsdom also keeps focus on disabled elements, so focus tests must assert the cause (e.g. "not disabled") rather than only `document.activeElement`.

## Stack and structure

- React 19 + Vite 8, using `@vitejs/plugin-react` (Oxc-based). The React Compiler is not enabled.
- ES modules throughout (`"type": "module"`), `.jsx` files, no TypeScript (the `@types/react*` packages are only there for editor hints).
- Entry: `index.html` → `src/main.jsx` (mounts `<App />` inside `<ToastProvider>` in `StrictMode`) → `src/App.jsx`.
- `src/api/events.js` is the only place that calls `fetch`. Every failure (network, timeout, non-2xx, malformed body) becomes an `ApiError`. A caller's own abort passes through as `AbortError` and isn't reported. `updateEvent` sends the full record because PUT replaces it.
- `src/lib/` holds pure helpers: `colors.js` (the 148 CSS named colors accepted as "web safe" names) and `events.js` (validation, cleaning, sort by company, and date/`createdOn` formatting).
- Events carry every property of the API's example payload in `React API Assignment.pdf`: `name`, `description`, `company`, `color`, `isActive`, `date` (`YYYY-MM-DD`), `time` (`HH:MM`), `email`, `phone`, `address`, `image` (an http(s) URL) and `createdOn`.
  - `EMPTY_EVENT_FIELDS` in `lib/events.js` lists the editable ones, all required.
  - `createdOn` isn't editable. `App` stamps it on create, in the API's `2020-09-05T03:56:56 +06:00` format, and PUT keeps it.
  - `toEvent` in the API client turns missing text properties into `''`. It keeps `isActive` only if it's a boolean, so the UI can show "Not set".
- Selecting an event card opens `EventDetailsModal`, a read-only view with no form controls. Each card's Edit button (under Delete) opens `EventModal` in edit mode. Both load the event fresh with `GET /events/{id}` through `src/hooks/useEventById.js`. `EventLoadState` renders their shared loading and error states, including toast, retry, retry focus, and dropping the event on a 404.
- `src/App.jsx` owns the event list and which modal is open. The list changes only after the server confirms a write, so a failed request never adds, edits or removes anything locally. The exception is a 404, which drops the event because it's already gone.
- `src/components/Modal.jsx` wraps a native `<dialog>` opened with `showModal()`. A modal dialog makes the rest of the page inert, so each open modal registers a toast slot after its content as the toast host, and `ToastProvider` portals toasts into it. Keep that if you replace the modal. Inside a modal the toasts sit in normal flow below the form, so they can't cover its buttons. Registering the `<dialog>` itself would put them above content that mounts later.
- Toasts:
  - Expiry: error toasts stay until dismissed; success toasts expire after 5 s, pausing while hovered or focused.
  - Duplicates: a repeated error replaces its identical toast.
  - Dismissing: closing a toast moves focus to the next toast, or back to where focus came from.
  - Clearing: `showToast` returns an id and `useDismissToast` clears a toast whose context has ended. That covers a list load error once a retry succeeds, a details or edit load error when its modal closes or its retry succeeds, and a save or delete error when its modal closes. 404 toasts stay, because they explain a vanished card.
  - Clearance on the page: toasts are fixed bottom-right there. `ToastProvider` sets `--toast-clearance` to their height, which `index.css` uses for the page's bottom padding and `scroll-padding-bottom`. It also scrolls the focused element clear of them.
- Editing an older event: `pickEventFields` leaves a missing `isActive` as `null`, and the Active/Inactive radios make the user choose. The form hint names the missing fields, and all errors show at once in edit mode.
- Form hint and saving state: the hint at the top of the form is a plain paragraph, not a live region, so it isn't re-read after every field. While saving it shows "Saving… Please wait.", which a separate hidden `role="status"` region announces. The Status radios' fieldset is `role="radiogroup"`, since radios don't support `aria-readonly`.
- Details retry: after a successful retry, the details modal focuses its loaded `<dl>`.
- Focus is handled deliberately; check it when changing modals or lists:
  - `Modal` opens and closes the dialog in a *layout* effect, so `close()` runs before React detaches it. It then returns focus to the opener, falling back to the page `h1` if the opener is gone.
  - A save can re-sort the list in the same commit and move the opener's card, which drops its focus. So `Modal` checks again in a microtask.
  - Forms focus their first field, and the delete confirmation focuses Cancel, from passive effects; `autoFocus` fires before `showModal()` and is lost.
  - When an event is removed with its modal open, `App.removeAndRefocus` moves focus to the `h1`.
  - "Try again" moves focus to the loading status, and then on to the result.
  - In the browser pane, scripted `.focus()` doesn't fire focus events while the page lacks window focus, so verify focus with real key presses or Playwright.
- Global styles live in `src/index.css` and component styles in `src/App.css`. Theming uses CSS custom properties on `:root` in `index.css` (`--text`, `--bg`, `--accent`, `--sans`, etc.), and dark mode overrides them through `@media (prefers-color-scheme: dark)`. To keep both themes working, reuse these variables rather than hard-coding colors. Files in `public/` are served from the root path.

## Lint rules worth knowing

`eslint.config.js` (flat config) applies `@eslint/js` recommended, `react-hooks` recommended (rules-of-hooks and exhaustive-deps), and `react-refresh` for Vite. With `react-refresh`, a component module should export only components, or HMR falls back to a full reload and lint warns. `dist/` is ignored.
