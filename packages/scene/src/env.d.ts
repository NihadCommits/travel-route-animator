// Remotion's bundler handles CSS imports; TypeScript only needs to know they exist.
declare module '*.css';

// Fonts are bundled as files (Remotion: asset/resource, Vite: assets); an import gives the URL.
declare module '*.woff2' {
  const url: string;
  export default url;
}
