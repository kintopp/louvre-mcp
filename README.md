# Louvre MCP

A Model Context Protocol (MCP) server for interacting with the Louvre museum's collection. This server provides tools to search and retrieve artwork information from the Louvre's digital collection.

## Features

- Search artworks in the Louvre collection
- Get detailed information about specific artworks
- Retrieve artwork images with different options (thumbnail, full size)

## Installation

```bash
npm install
```

## Installation in Claude Desktop

Get the code, build the project, and edit claude_desktop_config.json.
Add: 
```
"louvre": {
      "command": "node",
      "args": ["D:\\Path_to_projects\\louvreMCP\\build\\index.js"]
    },
```

    
## Usage

Build the project:
```bash
npm run build
```

Start the server:
```bash
npm start
```

## Available Tools

1. `search-artwork`: Search for artworks in the Louvre collection
2. `get-artwork-detail`: Get detailed information about a specific artwork
3. `get-artwork-images`: Retrieve images for a specific artwork

## License

ISC
