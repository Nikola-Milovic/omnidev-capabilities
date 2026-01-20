### Context7 Documentation Lookup

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

`resolveLibraryId(query, libraryName)` - Find the Context7 library ID for a given package name.

**Parameters:**
- \`query\`: The user's question or task (used to rank results by relevance)
- \`libraryName\`: The name of the library to search for

**Returns:** Library ID string (e.g., "/vercel/next.js", "/mongodb/docs")

`queryDocs(libraryId, query)` - Query documentation for a specific library.

**Parameters:**
- \`libraryId\`: Exact Context7-compatible library ID from `resolveLibraryId`
- \`query\`: The question or task to get relevant documentation for

**Returns:** Relevant documentation snippets and examples
