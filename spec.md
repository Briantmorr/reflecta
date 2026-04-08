V1 (MVP) Spec

1. Layout & UI Components:

Left Pane:
A navigator (like a file tree or list view) showing all saved journal entries with timestamps.
Clicking an entry loads it into the editor or preview area.
Center Pane (Writing Area):
TipTap editor for writing new entries or editing existing ones.
Markdown formatting support (bold, italics, lists, etc.).
A “Save” button.
Right Pane (Preview & Feedback):
After saving, the written entry is shown as a clean preview (formatted Markdown).
Below the preview, placeholder space for future LLM feedback.

2. Core Functionalities:

Create New Entry:
User clicks “New Entry” (or a plus button) from the navigator.
TipTap editor is blank and ready to write.
Save Entry:
On clicking “Save,” the entry (Markdown text + timestamp) is stored in Postgres.
Entry appears in the navigator list.
Load/Edit Entry:
Clicking any entry in the navigator loads it into TipTap for editing.
User can re-save after edits.

3. Data Model:

Postgres Table:
Columns: id (primary key), timestamp, content (Markdown), last_edited.

4. Tech Stack:

Frontend: JavaScript/TypeScript with TipTap for the editor.
Backend: Node.js, Python, or another stack handling API requests.
Database: Postgres storing text entries.
V1.5 (LLM Questions After Save)

1. Post-Save LLM Integration:

After the user clicks “Save”:
The backend sends the latest entry to an LLM API.
The LLM returns 3 reflective or insightful questions based on the entry.

2. UI Adjustments:

Below the preview of the saved entry:
Display the three LLM-generated questions.
Each question could be a simple text box for user reflection (optional).

3. Backend Expansion:

API integration with an LLM provider (e.g., OpenAI).
Store questions generated (for traceability, if desired).

4. Versioning:

Ensure the data model can evolve: Consider a new table for storing LLM insights or linking them to the entry ID.
