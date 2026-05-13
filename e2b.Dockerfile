FROM e2bdev/code-interpreter:latest

# Pre-populate npm cache with the full React + Vite + Tailwind stack so that
# npm install in runtime sandboxes reads from cache (~3s) instead of the network (~25s).
WORKDIR /tmp/lotus-warmup

RUN node -e " \
  const pkg = { \
    name: 'lotus-warmup', version: '1.0.0', private: true, \
    scripts: { dev: 'vite' }, \
    dependencies: { \
      react: '^18.3.1', 'react-dom': '^18.3.1', \
      'lucide-react': '^0.577.0', 'framer-motion': '^11.0.0', 'react-icons': '^5.0.0', \
      'react-router-dom': '^6.26.2', 'clsx': '^2.1.1', 'tailwind-merge': '^2.5.2', \
      'date-fns': '^3.6.0', 'zustand': '^4.5.5', \
    }, \
    devDependencies: { \
      vite: '^5.4.11', '@vitejs/plugin-react': '^4.3.4', \
      tailwindcss: '^3.4.17', postcss: '^8.4.49', autoprefixer: '^10.4.20', \
      typescript: '^5.6.2', '@types/react': '^18.3.1', '@types/react-dom': '^18.3.1', \
    }, \
  }; \
  require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2)); \
" \
  && npm install --legacy-peer-deps --no-audit --no-fund \
  && rm -rf node_modules

WORKDIR /home/user
