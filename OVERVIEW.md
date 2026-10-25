Visualise opens tldraw drawings inside Paseo. A `.tldr` file in your workspace opens in the full tldraw editor in its file tab, and a Visualise tab lists the workspace's drawings, creates new ones, and edits them in place. Every edit is saved back to the `.tldr` file, so the drawing lives with your project and works offline.

Send to tldraw.com copies the current drawing into your tldraw.com account. It opens tldraw.com's import page in Paseo's browser tab, where you sign in with tldraw's own login. The copy is one-way: edits made on tldraw.com do not come back to the file. tldraw.com offers no way for other apps to sign in or save on your behalf, so this hand-off is the supported route.

Licence: the tldraw SDK needs a licence key for everyday use. Development builds run without one but show a "Get a license for production" label. Production builds without a key stop drawing after a few seconds, and the panel then shows a notice. Add a key under Settings, Plugins, Visualise. tldraw issues hobby, trial and commercial keys; a key has to cover the editor's sandboxed frame, so ask tldraw for one that fits this plugin.

What it reads and sends: it reads and writes only `.tldr` files inside the workspace folder, on the machine running the Paseo daemon, and refuses paths that leave the workspace, including through symbolic links. The editor runs in a sandboxed frame with no network access and no storage. Send to tldraw.com serves the saved file once from a random address on 127.0.0.1, only to tldraw.com, for up to 10 minutes; tldraw.com fetches it after you sign in.

Changes on disk: when the file changes outside the editor and you have no unsaved edits, the drawing reloads. With unsaved edits you choose between reloading and overwriting. Closing a tab with unsaved edits asks first.

Limits: requires Paseo 0.13. The editor runs in the desktop and web apps; mobile shows a notice. Send to tldraw.com needs the desktop app's browser tab. The interface is English only. Agents do not have drawing tools yet.
