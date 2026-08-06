/// <reference types="vite/client" />

// vite-imagetools query imports (e.g. "./photo.png?format=webp&w=160")
declare module "*?format=webp&quality=80&w=160" {
  const src: string;
  export default src;
}
