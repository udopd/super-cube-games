(() => {
  const api = document.getElementById('docsApiPanel');
  if (!api) return;

  function exampleFor(method, path) {
    const realPath = path.replace(/:slug\b/g, 'pocket-clicker')
      .replace(/:reviewId\b/g, '123').replace(/:id\b/g, '123')
      .replace(/:filename\b/g, 'avatar.png')
      .replace(/\*/g, 'assets/main.js');
    const upper = method.toUpperCase();
    if (realPath.startsWith('/user-avatars/')) {
      return `// Avatar endpoint returns an image, not JSON.\nconst image = document.createElement('img');\nimage.src = '${realPath}';\nimage.alt = 'Player avatar';\ndocument.body.append(image);`;
    }
    if (['/sitemap.xml', '/robots.txt'].includes(realPath)) {
      return `const response = await fetch('${realPath}');\nif (!response.ok) throw new Error('Request failed');\nconst text = await response.text();\nconsole.log(text); // XML or text/plain, not JSON`;
    }
    if (realPath === '/' || realPath === '/games' || realPath.startsWith('/games/pocket-clicker') || realPath.startsWith('/game-files/') || ['/admin','/admin/metrics','/admin/recommendations','/profile','/profile.html','/login','/login.html'].includes(realPath) || /\.(html|xml|txt)$/.test(realPath) && !realPath.startsWith('/api/')) {
      return `// Page or static asset: open it directly in the browser.\n// Private test routes require an administrator session.\nwindow.location.assign('${realPath}');`;
    }
    if (upper === 'GET' || upper === 'HEAD') {
      return `const response = await fetch('${realPath}', { credentials: 'same-origin' });\nconst data = await response.json().catch(() => null);\nif (!response.ok) throw new Error(data?.error || 'Request failed');\nconsole.log(data);`;
    }
    if (realPath.endsWith('/upload') || realPath.endsWith('/update') || realPath.endsWith('/capsule') || realPath === '/api/me/avatar') {
      const field = realPath === '/api/me/avatar' ? 'avatar' : realPath.endsWith('/capsule') ? 'capsule' : 'archive';
      return `const bootstrap = await fetch('/api/bootstrap', { credentials: 'same-origin' }).then(r => r.json());\nconst form = new FormData();\nform.append('${field}', fileInput.files[0]);\nconst response = await fetch('${realPath}', {\n  method: '${upper}', credentials: 'same-origin',\n  headers: { 'X-CSRF-Token': bootstrap.csrfToken },\n  body: form // Let the browser set multipart/form-data boundary.\n});\nconst data = await response.json();\nif (!response.ok) throw new Error(data.error || 'Request failed');`;
    }
    let body = '{}';
    if (upper === 'DELETE') body = '{}';
    else if (realPath.endsWith('/rating')) body = '{ rating: 5 }';
    else if (realPath.endsWith('/review') || /\/reviews\/\d+$/.test(realPath)) body = "{ body: 'A clear, helpful review of the game.' }";
    else if (realPath.endsWith('/favorite') || realPath.endsWith('/share') || realPath.endsWith('/logout')) body = '{}';
    else if (realPath.endsWith('/email/start')) body = "{ email: 'player@example.com' }";
    else if (realPath.endsWith('/email/verify')) body = "{ email: 'player@example.com', code: '123456' }";
    else if (realPath.endsWith('/save')) body = '{ data: { level: 3, score: 120 } }';
    else if (realPath.endsWith('/profile')) body = "{ name: 'Player' }";
    else if (realPath === '/api/auth/password') body = "{ email: 'player@example.com', password: 'YOUR_PASSWORD' }";
    else if (realPath.endsWith('/password')) body = "{ currentPassword: '...', newPassword: '...' }";
    else if (realPath.endsWith('/reply')) body = "{ body: 'Thanks for reporting this.' }";
    else if (realPath.endsWith('/email')) body = "{ subject: 'A message from SUPER CUBE', html: '<p>Hello!</p>' }";
    else if (realPath.endsWith('/games/upload')) body = "{ archive: '(use FormData with file field archive)' }";
    else if (realPath.includes('/publish') || realPath.includes('/unpublish')) body = '{}';
    else if (realPath.endsWith('/session/start')) body = "{ slug: 'pocket-clicker', guestId: 'guest-id-from-platform-sdk', source: 'direct' }";
    else if (realPath.endsWith('/session/heartbeat')) body = "{ sessionId: 'session-uuid', guestId: 'guest-id-from-platform-sdk', active: true }";
    else if (realPath.endsWith('/session/end')) body = "{ sessionId: 'session-uuid', guestId: 'guest-id-from-platform-sdk', active: true }";
    else if (realPath.endsWith('/sdk/event')) body = "{ slug: 'pocket-clicker', type: 'level_start', label: 'level-1' }";
    else if (realPath.endsWith('/events')) body = "{ slug: 'pocket-clicker', type: 'catalog_click' }";
    else if (realPath.startsWith('/api/admin/games/') && upper === 'PATCH') body = "{ title: 'Pocket Clicker', descriptionRu: '...', descriptionEn: '...', tagsEn: ['Casual'], tagsRu: ['Казуальная'], minPlayers: 1, maxPlayers: 1, runtimeType: 'browser' }";
    else if (realPath.endsWith('/verify')) body = "{ code: '123456' }";
    return `const bootstrap = await fetch('/api/bootstrap', { credentials: 'same-origin' }).then(r => r.json());\nconst response = await fetch('${realPath}', {\n  method: '${upper}', credentials: 'same-origin',\n  headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': bootstrap.csrfToken },\n  body: JSON.stringify(${body})\n});\nconst data = await response.json().catch(() => null);\nif (!response.ok) throw new Error(data?.error || 'Request failed');\nconsole.log(data);`;
  }

  function addEndpointExamples() {
    api.querySelectorAll('.api-endpoint').forEach((row) => {
      if (row.querySelector(':scope > details.api-request-example')) return;
      const routeCodes = [...row.querySelectorAll(':scope > code')];
      if (!routeCodes.length) return;
      const details = document.createElement('details');
      details.className = 'api-request-example';
      const summary = document.createElement('summary');
      summary.textContent = 'Показать пример запроса';
      details.appendChild(summary);
      routeCodes.forEach((node) => {
        const match = node.textContent.trim().match(/^(GET|POST|PATCH|DELETE|PUT|HEAD|OPTIONS)(?:\|(GET|POST|PATCH|DELETE|PUT|HEAD|OPTIONS))*\s+(.+)$/i);
        if (!match) return;
        const raw = node.textContent.trim();
        const firstSpace = raw.search(/\s/);
        const methods = raw.slice(0, firstSpace).split('|');
        const path = raw.slice(firstSpace).trim();
        methods.forEach((method) => {
          const heading = document.createElement('p');
          const methodCode = document.createElement('code'); methodCode.textContent = `${method} ${path}`;
          heading.appendChild(methodCode); details.appendChild(heading);
          const pre = document.createElement('pre'); const code = document.createElement('code');
          code.textContent = exampleFor(method, path); pre.appendChild(code); details.appendChild(pre);
        });
      });
      if (details.querySelector('pre')) row.appendChild(details);
    });
  }

  addEndpointExamples();
})();
