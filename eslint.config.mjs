import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================
// Lint HONESTO: las reglas de corrección van a error/aviso, no a off.
//  · error  → lo que jamás debe llegar a producción (debugger, código
//             inalcanzable, variables sin usar, redeclaraciones)
//  · warn   → deudas graduales (any, non-null assertions, deps de hooks)
//  · off    → solo reglas estilísticas que inundarían el código CAD
//             heredado (comillas tipográficas en español, console.error
//             legítimo en rutas de API, prop-types cubierto por TS)
// El gate real está en `npm run lint` + CI, ya no en "verde falso".
// ============================================================

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript — corrección a error
    "@typescript-eslint/no-unused-vars": ["error", {
      argsIgnorePattern: "^_",           // parámetros intencionalmente ignorados
      varsIgnorePattern: "^_",
      caughtErrors: "none",              // catch (e) sin usar es idiomático aquí
    }],
    // TypeScript — deuda gradual a aviso
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-non-null-assertion": "warn",
    "@typescript-eslint/ban-ts-comment": ["warn", {
      "ts-ignore": "allow-with-description",
    }],
    "@typescript-eslint/prefer-as-const": "error",

    // React — deps de hooks como aviso (corregir de forma incremental)
    "react-hooks/exhaustive-deps": "warn",
    // estilístico/apagadas justificadas (TS cubre propTypes/display-name;
    // el texto en español usa comillas tipográficas legítimamente)
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js — <img> con propósito (capturas/logos externos) a aviso
    "@next/next/no-img-element": "warn",
    "@next/next/no-html-link-for-pages": "error",

    // JS general — corrección a error
    "prefer-const": "error",
    "no-unused-vars": "off",            // delegado a @typescript-eslint
    "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    "no-debugger": "error",
    "no-empty": ["error", { allowEmptyCatch: true }], // catch vacío documentado es válido
    "no-irregular-whitespace": "error",
    "no-case-declarations": "error",
    "no-fallthrough": "error",
    "no-mixed-spaces-and-tabs": "error",
    "no-redeclare": "error",
    // TS cubre no-undef (el compilador lo detecta) y además marca falsos
    // positivos en posiciones de tipo como React.FormEvent — ver typescript-eslint
    "no-undef": "off",
    "no-unreachable": "error",
    "no-useless-escape": "error",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "scripts/**", "tests/**"]
}];

export default eslintConfig;
