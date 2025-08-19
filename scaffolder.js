#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to create directories recursively
function createDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

// Function to write file with content
function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Created file: ${filePath}`);
}

// Main scaffolding function
function scaffoldRepository() {
  console.log('🚀 Starting Dia game repository scaffolding...\n');

  // Create .github/workflows directory
  createDirectory('.github/workflows');

  // Create package.json
  const packageJson = {
    "name": "dia",
    "version": "1.0.0",
    "description": "dia",
    "main": "server.js",
    "dependencies": {
      "express": "^4.18.2"
    }
  };
  writeFile('package.json', JSON.stringify(packageJson, null, 2));

  // Create server.js
  const serverJs = `// server.js
const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Server running at http://localhost:\${PORT}\`);
});`;
  writeFile('server.js', serverJs);

  // Create Dockerfile
  const dockerfile = `# Use Node.js 20 (Alpine) as the base image
FROM node:23-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your application source code
COPY . .

# Expose the port your app runs on
EXPOSE 3000

# Run the application
CMD ["node", "server.js"]`;
  writeFile('dockerfile', dockerfile);

  // Create GitHub Actions workflow
  const workflowYml = `name: Manual Build and Push Docker Image

on:
  workflow_dispatch:  # This enables manual trigger only

jobs:
  build-and-push:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: \${{ secrets.DOCKERHUB_USERNAME }}
          password: \${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build Docker Image
        run: |
          docker build -t \${{ secrets.DOCKERHUB_USERNAME }}/dia:latest .

      - name: Push Docker Image
        run: |
          docker push \${{ secrets.DOCKERHUB_USERNAME }}/dia:latest`;
  writeFile('.github/workflows/main.yml', workflowYml);

  // Create manifest.json
  const manifestJson = {
    "name": "Dia",
    "short_name": "Dia",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#ffffff",
    "theme_color": "#000000",
    "icons": [
      {
        "src": "icon-192.png",
        "sizes": "192x192",
        "type": "image/png"
      },
      {
        "src": "icon-512.png",
        "sizes": "512x512",
        "type": "image/png"
      }
    ]
  };
  writeFile('manifest.json', JSON.stringify(manifestJson, null, 2));

  // Create service-worker.js
  const serviceWorkerJs = `// service-worker.js

// Generate a cache
const LIVE_CACHE = 'dia-v1';
const TEMP_CACHE = 'dia-temp-v1';

const ASSETS = [
  '/',
  '/index.html',
  '/main.js',
  '/styles.js',
  '/manifest.json',
  '/icon-512.png',
  '/icon-192.png',
  '/favicon.ico'
];

// Install: Download all assets into a temporary cache.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(TEMP_CACHE).then(tempCache => {
      // Fetch and cache every asset.
      return Promise.all(
        ASSETS.map(url => {
          return fetch(url).then(response => {
            if (!response.ok) {
              throw new Error(\`Failed to fetch \${url}\`);
            }
            return tempCache.put(url, response.clone());
          });
        })
      );
    })
  );
});

// Activate: If staging is complete, replace the live cache.
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const tempCache = await caches.open(TEMP_CACHE);
      const cachedRequests = await tempCache.keys();
      if (cachedRequests.length === ASSETS.length) {
        // New version is fully staged. Delete the old live cache.
        await caches.delete(LIVE_CACHE);
        const liveCache = await caches.open(LIVE_CACHE);
        // Copy everything from the temporary cache to the live cache.
        for (const request of cachedRequests) {
          const response = await tempCache.match(request);
          await liveCache.put(request, response);
        }
        // Delete the temporary cache.
        await caches.delete(TEMP_CACHE);
        // Optionally, notify clients to reload.
        const clients = await self.clients.matchAll();
        clients.forEach(client => client.postMessage({ action: 'reload' }));
      } else {
        // If staging failed, delete the temporary cache and keep the old live cache.
        console.error('Staging failed. Keeping the old cache.');
        await caches.delete(TEMP_CACHE);
      }
      await self.clients.claim();
    })()
  );
});

// Fetch: Always try the network first, but fall back to live cache if offline.
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Update the live cache with the fresh response.
        const responseClone = networkResponse.clone();
        caches.open(LIVE_CACHE).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      })
      .catch(() => {
        // If network fails, try to serve from the live cache.
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Optionally, return a fallback for unmatched requests.
          return new Response('Network error occurred', {
            status: 408,
            statusText: 'Network error'
          });
        });
      })
  );
});`;
  writeFile('service-worker.js', serviceWorkerJs);

  // Note: protagonist.json and decor.json are not created by this script
  // These files should be added manually with your game data

  // Create README.md
  const readmeContent = `# Resizer
Dia Game`;
  writeFile('README.md', readmeContent);

  // Create empty main content files as requested
  writeFile('index.html', '');
  writeFile('main.js', '');
  writeFile('styles.js', '');

  console.log('\n📝 Note: You will need to add the following files manually:');
  console.log('  - icon-192.png (192x192 PNG icon)');
  console.log('  - icon-512.png (512x512 PNG icon)');
  console.log('  - favicon.ico (favicon file)');

  console.log('\n✅ Repository scaffolding completed successfully!');
  console.log('\n🔧 Next steps:');
  console.log('  1. Run "npm install" to install dependencies');
  console.log('  2. Add protagonist.json and decor.json with your game data');
  console.log('  3. Add your game content to index.html, main.js, and styles.js');
  console.log('  4. Add the icon image files mentioned above');
  console.log('  5. Run "node server.js" to start the development server');
}

// Run the scaffolding
try {
  scaffoldRepository();
} catch (error) {
  console.error('❌ Error during scaffolding:', error.message);
  process.exit(1);
}
