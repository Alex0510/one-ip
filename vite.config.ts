import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";

function findClosingBrace(css: string, openingBrace: number) {
  let depth = 1;
  let quote = "";
  let comment = false;

  for (let index = openingBrace + 1; index < css.length; index += 1) {
    const character = css[index];
    const next = css[index + 1];

    if (comment) {
      if (character === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "*") {
      comment = true;
      index += 1;
      continue;
    }
    if ((character === '"' || character === "'") && css[index - 1] !== "\\") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return index;
  }

  return -1;
}

function extractCascadeLayerContents(css: string) {
  const contents: string[] = [];
  const layerPattern = /@layer(?:\s+[^;{]+)?\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = layerPattern.exec(css))) {
    const openingBrace = css.indexOf("{", match.index);
    const closingBrace = findClosingBrace(css, openingBrace);
    if (closingBrace < 0) break;
    contents.push(css.slice(openingBrace + 1, closingBrace));
    layerPattern.lastIndex = closingBrace + 1;
  }

  return contents.join("\n");
}

function legacyCascadeLayerStyles(version: string): Plugin {
  return {
    name: "legacy-cascade-layer-styles",
    transformIndexHtml(html) {
      return html.replaceAll("__LEGACY_CSS_VERSION__", version);
    },
    generateBundle(_, bundle) {
      const stylesheet = Object.values(bundle).find(
        (item) =>
          item.type === "asset" &&
          item.fileName.endsWith(".css") &&
          typeof item.source === "string" &&
          item.source.includes("@layer utilities"),
      );
      if (!stylesheet || stylesheet.type !== "asset") return;
      const source =
        typeof stylesheet.source === "string"
          ? stylesheet.source
          : new TextDecoder().decode(stylesheet.source);

      this.emitFile({
        type: "asset",
        fileName: "assets/index-legacy.css",
        source: extractCascadeLayerContents(source),
      });
    },
  };
}

function excludeBackendSource(): Plugin {
  let output = "";
  return {
    name: "exclude-backend-source",
    configResolved(config) {
      output = resolve(config.root, config.build.outDir, "worker");
    },
    async closeBundle() {
      await rm(output, { recursive: true, force: true });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (/^\/worker(?:\/|\?|$)/.test(req.url ?? "")) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        next();
      });
    },
  };
}

const headers = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
};

export default defineConfig(() => {
  // Evaluated by Vite at build time, not when a visitor opens the page.
  const buildTime = new Date().toISOString();

  return {
    plugins: [
      react(),
      tailwindcss(),
      legacyCascadeLayerStyles(buildTime),
      excludeBackendSource(),
      {
        name: "app-build-version",
        generateBundle() {
          this.emitFile({
            type: "asset",
            fileName: "app-version.json",
            source: JSON.stringify({ build: buildTime }),
          });
        },
      },
    ],
    optimizeDeps: {
      include: ["vaul", "@fingerprintjs/fingerprintjs"],
    },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    define: {
      "import.meta.env.VITE_BUILD_TIME": JSON.stringify(buildTime),
    },
    // iOS 16 ships Safari 16 WebKit. Vite defaults to `esnext`, which leaves
    // newer syntax in the module graph and makes the app fail before React
    // mounts on older WebKit versions.
    build: {
      target: "safari16",
    },
    server: {
      host: "127.0.0.1",
      port: 5137,
      hmr: { clientPort: 8787 },
      strictPort: true,
      open: false,
      headers,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8787",
          changeOrigin: false,
        },
      },
    },
    preview: { headers },
  };
});
