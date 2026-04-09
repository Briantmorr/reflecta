# Mirror — A Guided Tour of the Psyche

Mirror is an interactive web application that helps users explore their inner world through conversation and visualization.

Instead of traditional journaling, Mirror acts as a reflective companion. It uses a large language model (LLM) to guide users through meaningful questions about their life—family, relationships, work, and personal concerns—while dynamically constructing a living “map of the self.”

This map is represented as a graph, where:
- The user is the central node
- Key domains (family, work, relationships, identity) branch outward
- Specific entities (people, roles, experiences) expand those domains

As conversations evolve, the graph grows. As the graph grows, the conversation deepens.

---

## Core Concepts

### 1. Conversational Exploration
Users engage in a guided dialogue with an LLM. The system asks reflective, structured questions while allowing free-form input.

### 2. Dynamic Psyche Graph
User responses are parsed and mapped into a graph structure:
- Nodes = entities (person, role, concept)
- Edges = relationships (works with, child of, stress from, etc.)

### 3. Feedback Loop
The LLM:
1. Interprets user input
2. Updates the graph
3. Retrieves relevant context from the graph
4. Generates deeper follow-up questions

---

## Entry Point (Onboarding Flow)

On first use, Mirror initializes the graph using 3–5 seed questions:

- “Can you tell me about your family?”
- “What does your current work look like?”
- “Who are the most important people in your life right now?”
- “What has been on your mind lately?”
- “What is currently causing you stress or excitement?”

These responses populate the initial graph structure.

---

## Features (V1)

- Conversational interface (LLM-led dialogue)
- Dynamic graph visualization of user life domains
- Persistent conversation storage
- Conversation history explorer (left panel)
- Context-aware follow-up questioning
- Real-time graph updates from conversation

---

## Future Directions

- Aggregated insights across time
- “Value map” and “anti-value map”
- Emotional trend tracking
- Exportable psyche reports
- Memory weighting / importance scoring

---

## Setup Instructions

> (To be completed)

- Install dependencies
- Configure environment variables
- Connect database
- Run local dev server

---

## Deployment

Mirror is deployed automatically via Vercel.

- Any merge to `main` triggers a production deployment
- Preview deployments are created for pull requests

---

## Tech Stack (Summary)

- Frontend: React / Next.js
- Editor/Interaction: Chat-based UI
- Graph Visualization: (e.g., D3.js / React Flow)
- Backend: API routes (Next.js or separate service)
- Database:
  - SQLite (conversation storage)
  - (Future: Postgres for scale)
- LLM: OpenAI GPT-5.4

---

## Philosophy

Mirror is not just a journaling tool.

It is an evolving system that helps users:
- See themselves more clearly
- Understand patterns across their life
- Ask better questions about who they are

The goal is not just reflection—but structured self-understanding.