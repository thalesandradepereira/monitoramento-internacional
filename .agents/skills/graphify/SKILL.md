---
name: graphify-knowledge-graph
description: Uses the Graphify CLI to query the codebase's knowledge graph, saving tokens and providing deep structural context.
---

# Graphify Knowledge Graph Skill

You MUST use this skill when you need to understand the architecture of a repository, find references, or analyze the codebase globally without exhausting context window tokens.

## Usage

Graphify builds a persistent knowledge graph from code, docs, and diagrams, reducing token consumption.

To use it, execute the `graphify` CLI command via your `run_command` tool.

### Steps:
1. First, check if Graphify is installed in the environment by running `graphify --version` or `graphify --help`.
2. If it is not installed, install it using `pip install graphifyy` (Note the double 'y' for the package name).
3. Use the CLI to index or query the workspace as per the user's task. For example, if the user wants to understand the relationship between certain modules or locate specific implementations, use `graphify` commands to extract that sub-graph instead of `grep` or reading entire files.
