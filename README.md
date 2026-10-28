# Events

A single-page React app for managing events: list them (sorted by company), add, edit and delete, backed by `https://rf-json-server.herokuapp.com/events/`.

```bash
npm install
npm run dev
```

- Click **New** to create an event, or an event card to see all its details, read-only. Each card's **Edit** button opens the update form, and **Delete** removes the event after a confirmation.
- Events have the API's full set of properties: name, description, company, color, active status, date, time, email, phone, address and image URL. The creation timestamp is set automatically.
- Every field is required. The color has to be a CSS named color (e.g. `red`, `teal`, `rebeccapurple`). The date and time must be real, and the email, phone and image URL must be well-formed. The submit button stays disabled until the whole form is valid. When editing, it also stays disabled until something has changed.
- Any API failure shows a toast. The list only changes once the server confirms the request.

`npm test` runs the unit tests and `npm run lint` runs ESLint.

It needs Node 20.19+ or 22.12+. To run it on CodeSandbox, import the repo from GitHub as a Devbox (not a browser sandbox, and without a local `node_modules`). `.devcontainer/devcontainer.json` provides Node 22, and `.codesandbox/tasks.json` does a clean `npm ci` and starts the dev server with its preview on port 5173. (Port 2222 is the VM's SSH server, not the app.)
